"use strict";

dojo.require("esri.map");
dojo.require("esri.arcgis.utils");
dojo.require("esri.tasks.query");
dojo.require("esri.dijit.InfoWindowLite");

dojo.require("dojo.date.locale");

var map;

var shipsLayer;
var shipsFeatureLayer;
var waiting = false;
var playing = false;

var hostUrl = "http://79.125.13.101:6080/arcgis/rest/services";
var shipsUrl          = hostUrl + "/GEP_barcos/Barcos_Vigo/MapServer";
var shipsFeatureUrl   = hostUrl + "/GEP_barcos/Barcos_Vigo/FeatureServer";
var protectedAreasUrl = hostUrl + "/GEP_barcos/Reserva_Marina/MapServer";
var nauticalChartUrl  = hostUrl + "/s57/RegMar/MapServer/exts/Maritime%20Chart%20Server/MapServer";

function init()
{
	esriConfig.defaults.map.panDuration = 500;	// time in milliseconds, default panDuration: 250
	esriConfig.defaults.map.panRate = 1; 		// default panRate: 25
	esriConfig.defaults.map.zoomDuration = 500; // default zoomDuration: 500
	esriConfig.defaults.map.zoomRate = 1; 		// default zoomRate: 25

	var options = {
		basemap: "gray",
		center: [-9, 42],
		zoom: 10
	};

	map = new esri.Map("map", options);

	initMap();
};


function divideByTen(value,key,data) {	return String(value / 10); }
function toLower(value,key,data) { return value.toLowerCase(); }


function initMap()
{
	// -- layers

	// nautical chart layer (S-57)
	var nauticalChartLayer = new esri.layers.ArcGISDynamicMapServiceLayer(nauticalChartUrl);

	// protected areas layer
	var protectedAreasLayer = new esri.layers.ArcGISDynamicMapServiceLayer(protectedAreasUrl);

	// ships layer
	shipsLayer = new esri.layers.ArcGISDynamicMapServiceLayer(shipsUrl);
	shipsLayer.setDisableClientCaching(true);

	// feture layer to show popups
	var template = new esri.InfoTemplate();
	template.setTitle("<img src='http://79.125.13.101/flags/${COUNTRY:toLower}.png'/> <b>${NAME}</b>");
	template.setContent("<img class='thumbnail' width='150px' height='112px' src='${THUMBNAIL}' onerror='this.src=\"noimage.png\"'/><br/><b>Course: </b>${COURSE}º<br /><b>Speed:</b> ${SPEED:divideByTen} kt")

	var infoWindowLite = new esri.dijit.InfoWindowLite(null, dojo.create("div",null,map.root));
	infoWindowLite.startup();
	map.setInfoWindow(infoWindowLite);
	map.infoWindow.resize(155, 190);

	shipsFeatureLayer = new esri.layers.FeatureLayer(shipsFeatureUrl + "/0",
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
			map.infoWindow.setContent(g.getContent());
			map.infoWindow.setTitle(g.getTitle());
			map.infoWindow.show( evt.screenPoint, map.getInfoWindowAnchor(evt.screenPoint));
		}
	});
	dojo.connect(shipsFeatureLayer,"onMouseOut", function(evt)
	{
		map.infoWindow.hide();
	})

	map.addLayers([nauticalChartLayer,protectedAreasLayer,shipsLayer,shipsFeatureLayer]);


	// -- measure refresh time
	var updateStartTime;
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
			window.setTimeout(refresh,2500);
		}		
	})

	// -- update statistics after moving map
	dojo.connect(map,'onPanEnd',updateStats);
	dojo.connect(map,'onZoomEnd',updateStats);

	updateStats();
	play();
}

function play()
{
	if(!playing)
	{
		playing = true;
		refresh();
		console.log("playing");
	}
}

function stop()
{
	playing = false;
	console.log("stopped");
}

function updateStats()
{
	var statsTask = new esri.tasks.QueryTask(shipsUrl + "/0");
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
				var imgUrl = "http://79.125.13.101/flags/" + feature.attributes.COUNTRY.toLowerCase() + ".png";
				var img = "<img src='"+imgUrl+"' />";
				countryCounts += "<li>" + img + " " + feature.attributes.shipCount + "</li>";
				totalCount += feature.attributes.shipCount;
			});
			dojo.byId('shipcount').innerHTML = 
				"<b>Vessel count: </b>" + totalCount +
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
	[0,1].forEach(function(layerId)
	{
		var deleteUrl = shipsFeatureUrl + '/' + layerId + '/deleteFeatures';
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

function showHistory()
{
	shipsLayer.setVisibleLayers([0,1]);
}

function hideHistory()
{
	shipsLayer.setVisibleLayers([0]);
}

dojo.addOnLoad(init);