// handy things:
// https://www.mapbox.com/mapbox.js/example/v1.0.0/markercluster-multiple-groups/
// https://github.com/Leaflet/Leaflet.markercluster#usage
// http://wwwdev.ebi.ac.uk/ebiwebtrafficmap/kmlvector.html

var loadTimestamp = Date.now(); // capture time at page load
var parsedXMLtoJson; // we'll translate the XML to JSON

L.mapbox.accessToken = 'pk.eyJ1Ijoia2hhd2tpbnNlYmkiLCJhIjoiY2ludTZ2M3ltMDBtNXczbTJueW85ZmJjNyJ9.u6SIfnrYvGe6WFP3fOtaVQ';

var map = L.mapbox.map('map');

// process passed params
// shows just one type or make types a distinct colour?
// options: unified, portals, uniprot, ebi, distinct
var passedParam = location.search.split('legend=')[1];
// does the user want to hide the legend?
var passedParamLegend = location.search.split('hideLegend=')[1];
if ((passedParamLegend != 'false') && (passedParamLegend != undefined)) {
  passedParamLegend = passedParamLegend.split('&')[0]; // drop anything after &
  $('.legend.modal').hide();
}

// debug metrics
var debug = false;
var passedParamDebugMetrics = location.search.split('debug=')[1];
if ((passedParamDebugMetrics != 'false') && (passedParamDebugMetrics != undefined)) {
  debug = true;
}

map.setView([30, 10], 2);


L.tileLayer(
  'https://api.mapbox.com/styles/v1/khawkinsebi/cio2mav7q0018c2nk2vvg8xgt/tiles/{z}/{x}/{y}?access_token=' + L.mapbox.accessToken, {
      maxZoom: 10,
      minZoom: 2,
      tileSize: 512,
      zoomOffset: -1,
      attribution: '© <a href="//www.ebi.ac.uk/about">EMBL-EBI</a> © <a href="https://www.mapbox.com/map-feedback/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

// fix the map region
var southWest = L.latLng(-70, -140),
    northEast = L.latLng(70, 150),
    bounds = L.latLngBounds(southWest, northEast);
map.setMaxBounds(bounds);
map.scrollWheelZoom.disable();
map.options.maxZoom = 10;
map.options.minZoom = 2;

var clusterSizeFactor = function(passedClusterSize) { // how we size the clusters
  pixelIncrease = 20; // constant to ensure a minimum size
  return (Math.sqrt(passedClusterSize) * 5) + pixelIncrease;
}

function newMarkerClusterGroup(clusterColors,targetClusterCSSClass,clusterPopUpHTML) {
  var clusterName = new L.MarkerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 3,
    // chunkedLoading: true,
    // chunkDelay: 5,
    // chunkInterval: 10,
    animate: true,
    // animateAddingMarkers: true,
    iconCreateFunction: function(cluster) {
      var numberToShow = '',
          sizeClass = '';
      // show the number of results for more than 15
      if (cluster.getChildCount() > 15) {
        numberToShow = cluster.getChildCount();
      }
      // make it "big" if more than 35
      if (cluster.getChildCount() > 40) {
        sizeClass = 'big-cluster';
      }
      var factoredSize = clusterSizeFactor(cluster.getChildCount());
      return markerIcon = new L.DivIcon({
        iconSize: [factoredSize, factoredSize],
        html: '<div class="' + targetClusterCSSClass + ' ' + sizeClass + '" style="border-radius:'+ factoredSize + 'px; line-height:'+ factoredSize + 'px; border: 1px solid rgba(255,255,255,.8); ">' + numberToShow + '</div>'
      });

    }
  });

  clusterName.on('clustermouseover', function(ev) {
    // Child markers for this cluster are a.layer.getAllChildMarkers()
    L.popup().setLatLng(ev.latlng).setContent(clusterPopUpHTML).openOn(map);
  });
  clusterName.on('clustermouseout', function(ev) {
    map.closePopup();
  });

  return clusterName;
}

function processData(fetchedData) {
  var markerClustersTemporary = [];

  var counter = -1;

  fetchedData.eachLayer( function(marker) {
    counter++;
    if (typeof marker.feature !== 'undefined') {
      // add to marker group
      var a = marker.feature.geometry.coordinates;
      // var title = 'tesdt';
      var markerNode = L.circleMarker(new L.LatLng(a[1], a[0]), {
        stroke: true,
        color: 'rgba(255,255,255,.8)',
        weight: 2,
        fillColor: 'rgba(233,180,0,.8)',
        weight: '1',
        // fillColor: targetClusterGroupColor,
        fillOpacity: '1'
      });



      // console.log(parsedXMLtoJson.kml.Placemark[counter])
      var constructedLink = 'https://www.ebi.ac.uk/training/events/' + parsedXMLtoJson.kml.Placemark[counter].year + '/' + parsedXMLtoJson.kml.Placemark[counter].path;

      var popup = L.popup()
          .setContent('<p>'+marker.feature.properties.name + '</p><p><a target="_top" href="'+constructedLink+'" class="readmore">View the training page</a></p>');
      markerNode.bindPopup(popup).openPopup();

      markerNode.on('mouseover', function(e){
          markerNode.openPopup();
      });

      markerNode.setRadius(8);
      // markerNode.bindPopup(title);
      // group the layers by data source
      var targetLayer = marker.feature.properties['target-layer'];
      targetLayer = 'markerClustersEBI';
      if (markerClustersTemporary[targetLayer] == undefined) { markerClustersTemporary[targetLayer] = []; }
      markerClustersTemporary[targetLayer].push(markerNode);
    }
  });

  // process new nodes
  for(var index in markerClustersTemporary) {
    removeAndAddNodes(index,markerClustersTemporary[index]);
  }
}

// Progressivley load and unload nodes based on the number of nodes to move, and how quickly we pull data.
// We do this so the maps is less chunky adding and removing data.
function removeAndAddNodes(targetClusterGroup,queueToAdd) {

  targetClusterGroup = window[targetClusterGroup]; // reattach passed string to mapbox layer

  function addNodes() {
    if (queueToAdd.length == 0) {
      clearInterval(addNodesVar); // we're done
    } else {
      var nodeToProcess = queueToAdd.pop();

      if ((nodeToProcess._latlng.lat == '0') && (nodeToProcess._latlng.lng == '0')) {
        return false; // exit if the location didn't geocode
      }

      // add dot to map
      targetClusterGroup.addLayer(nodeToProcess);
    }
  }

  // run the queue
  var addNodesVar = window.setInterval(addNodes, 10);
}

// setup colours and markercluster objects
var markerClustersEBIColor = 'rgba(255,255,255,1)';
var markerClustersEBI = newMarkerClusterGroup(markerClustersEBIColor,'markerClustersEBI','<span style="">Click to zoom</span>');

map.addLayer(markerClustersEBI);


// run the data pull immediately on strap
// runClusters();

// legend stuff
function createLegend () {
  var legendHtml = '<h4>Request type</h4>' +
      '<div class="markerClustersEBI"><a href="#" class="display-toggle ebi"><span class="legend-icon"></span>EMBL-EBI</a></div>' +
      '<div><a href="#" class="pause"><span class="icon icon-functional" data-icon="o"></span>Pause</a></div>';
  $('.legend').html(legendHtml);


  // toggle button state with opacity
  function invokeLegendIcon(request) {
    var invokedLegendIcon = 'a.display-toggle.'+request+' span.legend-icon';
    if ($(invokedLegendIcon).css('opacity')== 1) {
      $(invokedLegendIcon).css('opacity',.25);
      $('body').removeClass('display-'+request);
    } else {
      $(invokedLegendIcon).css('opacity',1);
      $('body').addClass('display-'+request);
    }
  }

  // Legend toggling
  $('a.display-toggle').on('click',function() {
    // which has the user requested?
    if ($(this).hasClass('unified')) { invokeLegendIcon('unified'); }
    if ($(this).hasClass('ebi')) { invokeLegendIcon('ebi'); }
    if ($(this).hasClass('portals')) { invokeLegendIcon('portals'); }
    if ($(this).hasClass('uniprot')) { invokeLegendIcon('uniprot'); }
  });

}

createLegend();

$.ajax({
  type: "GET",
  url: 'https://www.ebi.ac.uk/api/v1/offsite-training-map.xml',
  dataType: "text",
  timeout:3000,
  success: function(data, textStatus, request) {

    var parser = new DOMParser();
    parsedXMLtoJson = parser.parseFromString(data,"text/xml");
    parsedXMLtoJson = xmlToJson(parsedXMLtoJson);

    // fake it til you make it
    // Curerntly we can't get "real" KML out, so we tweak some things...
    var re = /<Point>/gi;
    data = data.replace(re, '<Point><coordinates>');
    re = /<\/Point>/gi;
    data = data.replace(re, '</coordinates></Point>');

    data = omnivore.kml.parse(data);
    if (debug) console.log(data._layers);
    processData(data);
  },
  error: function(jqXHR, textStatus){
    if(textStatus === 'timeout') {
      // console.log('Unable to get data source in a timely fashion',jqXHR);
    }
  }
});


// Changes XML to JSON
// Modified version from here: http://davidwalsh.name/convert-xml-json
function xmlToJson(xml) {



	// Create the return object
	var obj = {};

	if (xml.nodeType == 1) { // element
		// do attributes
		if (xml.attributes.length > 0) {
		obj["@attributes"] = {};
			for (var j = 0; j < xml.attributes.length; j++) {
				var attribute = xml.attributes.item(j);
				obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
			}
		}
	} else if (xml.nodeType == 3) { // text
		obj = xml.nodeValue;
	}

	// do children
	// If just one text node inside
	if (xml.hasChildNodes() && xml.childNodes.length === 1 && xml.childNodes[0].nodeType === 3) {
		obj = xml.childNodes[0].nodeValue;
	}
	else if (xml.hasChildNodes()) {
		for(var i = 0; i < xml.childNodes.length; i++) {
			var item = xml.childNodes.item(i);
			var nodeName = item.nodeName;
			if (typeof(obj[nodeName]) == "undefined") {
				obj[nodeName] = xmlToJson(item);
			} else {
				if (typeof(obj[nodeName].push) == "undefined") {
					var old = obj[nodeName];
					obj[nodeName] = [];
					obj[nodeName].push(old);
				}
				obj[nodeName].push(xmlToJson(item));
			}
		}
	}

	return obj;
}
