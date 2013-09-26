"use strict";

dojo.require("esri.map");
dojo.require("esri.arcgis.utils");
dojo.require("esri.tasks.query");
dojo.require("esri.layers.agstiled");
dojo.require("esri.dijit.InfoWindowLite");

dojo.require("dojo.date.locale");

var map;

var shipsLayer;
var shipsFeatureLayer;
var nauticalChartLayer;
var protectedAreasLayer;

var waiting = false;
var playing = false;

var historyVisible = false;
var alertsVisible = false;

var infoWindowTimeout = null;

function init()
{
	esriConfig.defaults.map.panDuration = 500;	// time in milliseconds, default panDuration: 250
	esriConfig.defaults.map.panRate = 1; 		// default panRate: 25
	esriConfig.defaults.map.zoomDuration = 500; // default zoomDuration: 500
	esriConfig.defaults.map.zoomRate = 1; 		// default zoomRate: 25

	var options = {
//		basemap: "satellite",
		basemap: "gray",
		center: [-9.2, 42.5], //[-9, 42],	// costa gallega
		//center: [-5.36, 36],	// estrecho de gibraltar
		zoom: 9
	};

	map = new esri.Map("map", options);

	/*
	var url = "http://tile.cloudmade.com/1a1b06b230af4efdbb989ea99e9841af/999/256/${level}/${col}/${row}.png";
//	var url = "http://${subDomain}.tiles.mapbox.com/v3/mapbox.control-room/${level}/${col}/${row}.png";
	//var options = { subDomains: ["a","b","c","d"] };
	var options = {};
	var base = new esri.layers.WebTiledLayer(url,options);
	map.addLayer(base); 
	*/

	initMap();
};


function divideByTen(value,key,data) {	return String(value / 10); }
function toLower(value,key,data) { return value.toLowerCase(); }
function getTypeName(value,key,data) { return shipsFeatureLayer.types.filter(function(t){ return t.id==value; })[0].name}

function initMap()
{
	// -- layers
	//var wmtsLayer = new esri.layers.ArcGISTiledMapServiceLayer('http://www.esridemos.com/arcgis/rest/services/xunta/XuntaBase/MapServer')

	// nautical chart layer (S-57)
	nauticalChartLayer = new esri.layers.ArcGISDynamicMapServiceLayer(config.nauticalChartUrl);

	// protected areas layer
	protectedAreasLayer = new esri.layers.ArcGISDynamicMapServiceLayer(config.protectedAreasUrl);
	protectedAreasLayer.setImageFormat('png32');
	
	
	// ships layer
	shipsLayer = new esri.layers.ArcGISDynamicMapServiceLayer(config.shipsUrl);
	shipsLayer.setDisableClientCaching(true);
	shipsLayer.setImageFormat('png32');

	// feture layer to show popups
	var template = new esri.InfoTemplate();
	template.setTitle("<img src='flags/${COUNTRY:toLower}.png'/> <b>${NAME}</b>");
	template.setContent("<img class='thumbnail' width='150px' height='112px' src='${THUMBNAIL}' onerror='this.src=\"noimage.png\"'/><br/>" + 
		"<span class='label'>Ship Type</span>${SHIP_TYPE:getTypeName}<br />" +
		"<span class='label'>Course</span>${COURSE}º<br />" +
		"<span class='label'>Speed</span>${SPEED:divideByTen} kt")

	var infoWindowLite = new esri.dijit.InfoWindowLite(null, dojo.create("div",null,map.root));
	infoWindowLite.startup();
	map.setInfoWindow(infoWindowLite);

	shipsFeatureLayer = new esri.layers.FeatureLayer(config.shipsFeatureUrl + "/0",
	{
		mode: esri.layers.FeatureLayer.MODE_ONDEMAND,
		outFields: ["*"],
		infoTemplate:template
	});
	var symbol = new esri.symbol.SimpleMarkerSymbol();
	symbol.setStyle(esri.symbol.SimpleMarkerSymbol.STYLE_CIRCLE);
	symbol.setSize(30);
	symbol.setColor(new dojo.Color([255,255,255,0]));
	symbol.setOutline(new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_NULL));
	shipsFeatureLayer.setRenderer(new esri.renderer.SimpleRenderer(symbol));

	dojo.connect(shipsFeatureLayer,"onMouseOver", function(evt)
	{
		//if( map.getScale() < 600000 )
		{		
			var g = evt.graphic;
			map.infoWindow.resize(155, 200);
			map.infoWindow.setContent(g.getContent());
			map.infoWindow.setTitle(g.getTitle());
			cancelInfoWindowTimeout();
			map.infoWindow.show( evt.screenPoint, map.getInfoWindowAnchor(evt.screenPoint));
		}
	});
	dojo.connect(shipsFeatureLayer,"onMouseOut", function(evt)
	{
		cancelInfoWindowTimeout();
		infoWindowTimeout = window.setTimeout(function() { map.infoWindow.hide() }, 500);
	})

	map.addLayers([nauticalChartLayer,protectedAreasLayer,shipsLayer,shipsFeatureLayer]);


	// -- measure refresh time
	var updateStartTime;
	var timerId;
	dojo.connect(shipsLayer,"onUpdateStart", function()
	{
		updateStartTime = new Date().getTime();
		dojo.byId('elapsed').innerHTML = "***";
		waiting = true;
	});
	dojo.connect(shipsLayer,"onUpdateEnd", function()
	{
		var elapsed = new Date().getTime() - updateStartTime;
		dojo.byId('elapsed').innerHTML = "<b>Refresh:</b> " + elapsed/1000 + " sec.";
		waiting = false;

		if( playing )
		{
			window.setTimeout( refresh,2500);
		}		
	})

	// -- update statistics after moving map
	dojo.connect(map,'onPanEnd',updateStats);
	dojo.connect(map,'onZoomEnd',updateStats);

	dojo.connect(dojo.byId('play'), 'onclick', play );
	dojo.connect(dojo.byId('stop'), 'onclick', stop );
	dojo.connect(dojo.byId('showAlerts'), 'onclick', showAlerts );
	dojo.connect(dojo.byId('hideAlerts'), 'onclick', hideAlerts );
	dojo.connect(dojo.byId('showProtectedAreas'), 'onclick', showProtectedAreas );
	dojo.connect(dojo.byId('hideProtectedAreas'), 'onclick', hideProtectedAreas );
	dojo.connect(dojo.byId('showHistory'), 'onclick', showHistory );
	dojo.connect(dojo.byId('hideHistory'), 'onclick', hideHistory );
	dojo.connect(dojo.byId('clearHistory'), 'onclick', clearHistory );
	dojo.connect(dojo.byId('showChart'), 'onclick', showChart );
	dojo.connect(dojo.byId('hideChart'), 'onclick', hideChart );
	dojo.connect(dojo.byId('showGray'), 'onclick', showGray );
	dojo.connect(dojo.byId('showSatellite'), 'onclick', showSatellite );

	dojo.connect(dojo.byId('footer'), 'onmouseover', function()
	{
		dojo.byId('hosturl').innerHTML = hostUrl.split('/')[2];
	});
	dojo.connect(dojo.byId('footer'), 'onmouseout', function()
	{
		dojo.byId('hosturl').innerHTML = "";
	});

	updateStats();
	hideHistory();
	hideAlerts();
	hideChart();
	hideProtectedAreas();
	play();
}

function cancelInfoWindowTimeout()
{
	if( infoWindowTimeout )
	{
		window.clearTimeout(infoWindowTimeout);
		infoWindowTimeout = null;
	}
}

function play()
{
	if(!playing)
	{
		playing = true;
		refresh();
		console.log("playing");
	}
	dojo.addClass('play','selected');
	dojo.removeClass('stop','selected');
}

function stop()
{
	playing = false;
	console.log("stopped");
	dojo.removeClass('play','selected');
	dojo.addClass('stop','selected');
}

function updateStats()
{
	var statsTask = new esri.tasks.QueryTask(config.shipsUrl + "/0");
	var query = new esri.tasks.Query();
	var statsDef1 = new esri.tasks.StatisticDefinition();

	// not useful, because this field gest updated with current timestamp instead of event timestamp
	// see NIM090719: When working with time enabled data, the Date field attribute is automatically updated while updating a field in a feature service.
	statsDef1.statisticType = "max";
	statsDef1.onStatisticField = "TIMESTAMP_";
	statsDef1.outStatisticFieldName = "maxTimestamp";

	var statsDef2 = new esri.tasks.StatisticDefinition();
	statsDef2.statisticType = "count";
	statsDef2.onStatisticField = "MMSI";
	statsDef2.outStatisticFieldName = "shipCount";

	query.returnGeometry			 = false;
	query.outStatistics 			 = [statsDef1,statsDef2];
	query.groupByFieldsForStatistics = ["COUNTRY"];
	query.orderByFields 			 = ["shipCount DESC"];
	query.geometry 					 = map.extent;

	statsTask.execute(query, 
		function(result)
		{
			var countryCounts = "";
			var totalCount = 0;
			result.features.forEach(function(feature) {
				var imgUrl = "flags/" + feature.attributes.COUNTRY.toLowerCase() + ".png";
				var img = "<img src='"+imgUrl+"' />";
				countryCounts += "<li>" + img + " " + feature.attributes.shipCount + "</li>";
				totalCount += feature.attributes.shipCount;
			});
			dojo.byId('shipcount').innerHTML = 
				"<b>Número de Barcos: </b>" + totalCount +
				"<br/><ul>" + countryCounts + "</ul>";
		},
		function(error)
		{
			console.log(error)
		}
	);
}

function refresh()
{
	if( ! waiting )
	{
		shipsLayer.refresh();
	}
	updateStats();
}

function clearHistory()
{
	if( !confirm("This will empty all features from ships and history layers. Continue?") )
		return;
	
	[0,1,2].forEach(function(layerId)
	{
		var deleteUrl = config.shipsFeatureUrl + '/' + layerId + '/deleteFeatures';
		console.log("deleting: " + deleteUrl);
		var deleteRequest = esri.request({
			url: deleteUrl,
			content: { f: 'json', where:"1=1" },
			handleAs: 'json'
		},
		{
			usePost: true
		}
		);
		deleteRequest.then(
			function(response)
			{
				console.log("Success: ", response);
				refresh();
			},
			function(error)
			{
				console.log("Error: ", error);
			}
		);
	})
}

function setLayerVisibility()
{
	if( historyVisible )
	{
		dojo.addClass('showHistory','selected');
		dojo.removeClass('hideHistory','selected');
	}
	else
	{
		dojo.removeClass('showHistory','selected');
		dojo.addClass('hideHistory','selected');
	}

	if( alertsVisible )
	{
		dojo.addClass('showAlerts','selected');
		dojo.removeClass('hideAlerts','selected');
	}
	else
	{
		dojo.removeClass('showAlerts','selected');
		dojo.addClass('hideAlerts','selected');
	}

	var visibleLayers = [0];
	if( alertsVisible ) visibleLayers.push(1);
	if( historyVisible ) visibleLayers.push(2);
	shipsLayer.setVisibleLayers(visibleLayers);
}

function showHistory()
{
	historyVisible = true;
	setLayerVisibility();
}

function hideHistory()
{
	historyVisible = false;
	setLayerVisibility();
}

function showAlerts()
{
	alertsVisible = true;
	setLayerVisibility();
}

function hideAlerts()
{
	alertsVisible = false;
	setLayerVisibility();
}

function showChart()
{
	nauticalChartLayer.setVisibility(true);
	dojo.addClass('showChart','selected');
	dojo.removeClass('hideChart','selected');
}

function hideChart()
{
	nauticalChartLayer.setVisibility(false);
	dojo.removeClass('showChart','selected');
	dojo.addClass('hideChart','selected');
}

function showProtectedAreas()
{
	protectedAreasLayer.setVisibility(true);
	dojo.addClass('showProtectedAreas','selected');
	dojo.removeClass('hideProtectedAreas','selected');
}

function hideProtectedAreas()
{
	protectedAreasLayer.setVisibility(false);
	dojo.removeClass('showProtectedAreas','selected');
	dojo.addClass('hideProtectedAreas','selected');
}

function showGray()
{
	map.setBasemap("gray");
	dojo.removeClass(dojo.body(), 'white');
	dojo.addClass('showGray','selected');
	dojo.removeClass('showSatellite','selected');
}

function showSatellite()
{	
	map.setBasemap("satellite");
	dojo.addClass(dojo.body(), 'white');
	dojo.removeClass('showGray','selected');
	dojo.addClass('showSatellite','selected');
}

dojo.addOnLoad(init);