"use strict";

dojo.require("esri.map");
dojo.require("esri.arcgis.utils");
dojo.require("esri.tasks.query");
dojo.require("esri.dijit.InfoWindowLite");

dojo.require("dojo.date.locale");

var map;
var dynamicLayer;
var layerBarcos;
var waiting = false;
var playing = false;


var barcosUrl = "http://79.125.13.101:6080/arcgis/rest/services/GEP_barcos/Barcos_Vigo/MapServer";
var reservaUrl = "http://79.125.13.101:6080/arcgis/rest/services/GEP_barcos/Reserva_Marina/MapServer";
var barcosFeatureUrl = "http://79.125.13.101:6080/arcgis/rest/services/GEP_barcos/Barcos_Vigo/FeatureServer";
var cartaNauticaUrl = "http://79.125.13.101:6080/arcgis/rest/services/s57/RegMar/MapServer/exts/Maritime%20Chart%20Server/MapServer";

function init()
{

	esriConfig.defaults.map.panDuration = 500; // time in milliseconds, default panDuration: 250
	esriConfig.defaults.map.panRate = 1; // default panRate: 25
	esriConfig.defaults.map.zoomDuration = 500; // default zoomDuration: 500
	esriConfig.defaults.map.zoomRate = 1; // default zoomRate: 25

	var options = {
		basemap: "gray",
		center: [-9, 42],
		zoom: 10
	};

	map = new esri.Map("map", options);

	initMap();
};

function init2()
{
	var mapDeferred = esri.arcgis.utils.createMap("f361c51169354eeca8221f3da46c9014","map");
	mapDeferred.then(function(response)
	{
		map = response.map;

		var title = response.itemInfo.item.title;
		var subtitle = response.itemInfo.item.snippet;
		console.log(response.itemInfo.item);

		if( map.loaded ) {
			initMap();
		}
		else
		{
			dojo.connect(map,"onLoad",function(){
				initMap();
			});
		}
	},function(error)
	{
		console.log("Can't create map: ", dojo.toJson(error),error);
	});

}

function divideByTen(value,key,data) {	return String(value / 10); }
function toLower(value,key,data) { return value.toLowerCase(); }


function initMap()
{
	// capa de carta nautica (S-57)
	var layerCartaNautica = new esri.layers.ArcGISDynamicMapServiceLayer(cartaNauticaUrl);

	// capa de la reserva marina
	var layerReserva = new esri.layers.ArcGISDynamicMapServiceLayer(reservaUrl);

	// capa de barcos
	dynamicLayer = new esri.layers.ArcGISDynamicMapServiceLayer(barcosUrl);
	dynamicLayer.setDisableClientCaching(true);

	var template = new esri.InfoTemplate();
	template.setTitle("<img src='http://79.125.13.101/flags/${COUNTRY:toLower}.png'/> <b>${NAME}</b>");
	template.setContent("<img class='thumbnail' width='150px' height='112px' src='${THUMBNAIL}' onerror='this.src=\"noimage.png\"'/><br/><b>Course: </b>${COURSE}º<br /><b>Speed:</b> ${SPEED:divideByTen} kt")

	var infoWindowLite = new esri.dijit.InfoWindowLite(null, dojo.create("div",null,map.root));
	infoWindowLite.startup();
	map.setInfoWindow(infoWindowLite);
	map.infoWindow.resize(155, 190);

	layerBarcos = new esri.layers.FeatureLayer(barcosFeatureUrl + "/0",
	{
		mode: esri.layers.FeatureLayer.MODE_ONDEMAND,
		//mode: esri.layers.FeatureLayer.MODE_SELECTION,
		outFields: ["*"],
		infoTemplate:template
	});
	var symbol = new esri.symbol.SimpleMarkerSymbol();
	symbol.setStyle(esri.symbol.SimpleMarkerSymbol.STYLE_CIRCLE);
	symbol.setSize(30);
	symbol.setColor(new dojo.Color([255,255,255,0]));
	symbol.setOutline(new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_NULL));
	layerBarcos.setRenderer(new esri.renderer.SimpleRenderer(symbol));

	dojo.connect(layerBarcos,"onMouseOver", function(evt)
	{
		//if( map.getScale() < 600000 )
		{		
			var g = evt.graphic;
			map.infoWindow.setContent(g.getContent());
			map.infoWindow.setTitle(g.getTitle());
			map.infoWindow.show( evt.screenPoint, map.getInfoWindowAnchor(evt.screenPoint));
		}
	});
	dojo.connect(layerBarcos,"onMouseOut", function(evt)
	{
		map.infoWindow.hide();
	})

	map.addLayers([layerCartaNautica,layerReserva,dynamicLayer,layerBarcos]);

	// para medir el tiempo
	var updateStartTime;
	dojo.connect(dynamicLayer,"onUpdateStart", function()
	{
		updateStartTime = new Date().getTime();
		//dojo.byId('elapsed').innerHTML = "<b>Tiempo:</b> - sec.";
		dojo.byId('elapsed').innerHTML = "***";
		waiting = true;
	});
	dojo.connect(dynamicLayer,"onUpdateEnd", function()
	{
		var elapsed = new Date().getTime() - updateStartTime;
		//console.log("elapsed: " + elapsed/1000 + " sec.");
		dojo.byId('elapsed').innerHTML = "<b>Refresh:</b> " + elapsed/1000 + " sec.";
		//dojo.byId('elapsed').innerHTML = "";
		waiting = false;

		if( playing )
		{
			window.setTimeout(refresh,2500);
		}		
	})

	dojo.connect(map,'onPanEnd',updateStats);
	dojo.connect(map,'onZoomEnd',updateStats);
	// dojo.connect(map,'onClick', function(evt)
	// {
	// 	var query = new esri.tasks.Query();
	// 	query.geometry = evt.mapPoint;
	// 	layerBarcos.selectFeatures(query,esri.layers.FeatureLayer.SELECTION_NEW);
	// });

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
	console.log("updating stats");

	var statsTask = new esri.tasks.QueryTask(barcosUrl + "/0");
	var query = new esri.tasks.Query();
	var statsDef1 = new esri.tasks.StatisticDefinition();

	statsDef1.statisticType = "max";
	statsDef1.onStatisticField = "TIMESTAMP_";
	statsDef1.outStatisticFieldName = "maxTimestamp";

	var statsDef2 = new esri.tasks.StatisticDefinition();
	statsDef2.statisticType = "count";
	statsDef2.onStatisticField = "MMSI";
	statsDef2.outStatisticFieldName = "shipCount";

	query.returnGeometry = false;
	query.outStatistics = [statsDef1,statsDef2];
	query.groupByFieldsForStatistics = ["COUNTRY"];
	query.orderByFields = ["shipCount DESC"];
	query.geometry = map.extent;

	statsTask.execute(query, 
		function(result)
		{
			/*
			var maxTimestamp = result.features[0].attributes.maxTimestamp;
			var shipCount = result.features[0].attributes.shipCount;

			if(maxTimestamp) {
				maxTimestamp = dojo.date.locale.format(new Date(maxTimestamp));
			} else {
				maxTimestamp = "n/a";
			}

			console.log(maxTimestamp,shipCount);
			*/
// no lo muestro porque hay un NIM en los feature services que machacan el valor del campo timestamp con la hora actual
//			dojo.byId('timestamp').innerHTML = "<b>Última Actualización</b><br/>" + maxTimestamp;
			var countryCounts = "";
			var total = 0;
			result.features.forEach(function(feature) {
				var imgUrl = "http://79.125.13.101/flags/" + feature.attributes.COUNTRY.toLowerCase() + ".png";
				var img = "<img src='"+imgUrl+"' />";
				countryCounts += "<li>" + img + " " + feature.attributes.shipCount + "</li>";
				total += feature.attributes.shipCount;
			});
			dojo.byId('shipcount').innerHTML = "<b>Vessel count: </b>" + total + "<br/><ul>" + countryCounts + "</ul>";
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
		dynamicLayer.refresh();
	}
	updateStats();
}

function clearHistory()
{
	[0,1].forEach(function(layerId)
	{
		var deleteUrl = barcosFeatureUrl + '/' + layerId + '/deleteFeatures';
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
	dynamicLayer.setVisibleLayers([0,1]);
}

function hideHistory()
{
	dynamicLayer.setVisibleLayers([0]);
}

dojo.addOnLoad(init);