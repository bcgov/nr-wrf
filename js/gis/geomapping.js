require([
	"esri/config",
	"esri/Map",
	"esri/views/MapView",
	"esri/layers/GraphicsLayer",
	"esri/widgets/Sketch",
	"esri/Graphic",
	"esri/geometry/Point",
	"esri/geometry/support/geodesicUtils",
	"esri/widgets/CoordinateConversion",
	"esri/geometry/support/webMercatorUtils",
	"esri/layers/GraphicsLayer",
	"dojo/domReady!"
], function (esriConfig,
	Map,
	MapView,
	GraphicsLayer,
	Sketch,
	Graphic,
	Point,
	geodesicUtils,
	CoordinateConversion,
	webMercatorUtils,
	GraphicsLayer) {

	var lines;

	const MAX_J = 425;
	const MAX_I = 476


	fetch('https://nrs.objectstore.gov.bc.ca/kadkvt/domaininfo_bcwrf.csv')
		.then(function (response) {
			return response.text()
		})
		.then(function (csv) {

			// each line has the format I,J,LAT,LON
			lines = csv.split("\n");

			var boundingPoints = [];

			for (var n = 3; n < lines.length; n++) {
				var currentLine = lines[n].split(",");
	
				boundingPoints.push(
					{
						latitude: currentLine[2],
						longitude: currentLine[3]
					});
	
			}
		});

	const graphicsLayer = new GraphicsLayer();
	const boundaryGraphicsLayer = new GraphicsLayer();
	
	esriConfig.apiKey = "AAPK1c42e0bed09a4c5e9cd405eb8aa385be8iJCXX-m6zsVighHNzd5NLLVAhwtmAUOE5ZqrPseB8GuryyEHumQSDFtQJjjY3g_";
	const map = new Map({
		basemap: "arcgis-topographic", // Basemap layer
		layers: [graphicsLayer]
	});
	const view = new MapView({
		map: map,
		center: [-124.8563, 55.1],
		zoom: 5, // scale: 72223.819286
		container: "viewDiv",
	});

	const ccWidget = new CoordinateConversion({
		view: view
	});

	var bottomLeftXGlobal;
	var bottomLeftYGlobal
	var topRightXGlobal;
	var topRightYGlobal;

	view.ui.add(ccWidget, "bottom-right");

	const sketch = new Sketch({
		layer: graphicsLayer,
		view: view,
		visibleElements: {
			createTools: {
				point: false,
				circle: false,
				polygon: false,
				polyline: false,
				rectangle: true
			},
			selectionTools: {
				"lasso-selection": false,
				"rectangle-selection": false,
				"pointer-selection": false /* this has no effect - I don't know the correct name for this tool */
			},
			undoRedoMenu: false
		},
		container: document.getElementById("sketchdiv")
		// graphic will be selected as soon as it is created

	});

	sketch.on("create", function(event){  

		var stroke = {
			color: [255, 255, 255],
			width: 1
		  };
		  
		  //*** White fill color with 50% transparency ***//
		  var fillColor = [227, 139, 79, 0.8];
		  
		  //*** Override all of the default symbol colors and sizes ***//
		  var pointSymbol = sketch.viewModel.pointSymbol;
		  pointSymbol.color = fillColor;
		  pointSymbol.outline = stroke;
		  pointSymbol.size = 8;
		  
		  var polylineSymbol = sketch.viewModel.polylineSymbol;
		  polylineSymbol.color = stroke.color;
		  polylineSymbol.width = stroke.width;
		  
		  var polygonSymbol = sketch.viewModel.polygonSymbol;
		  polygonSymbol.color = fillColor;
		  polygonSymbol.outline = stroke;

		// when draw rectangle create event is completed  
		if (event.state === "complete" && event.tool === "rectangle"){
			var minLatLong =  webMercatorUtils.xyToLngLat(event.graphic.geometry.extent.xmin,event.graphic.geometry.extent.ymin)
			var maxLatLong =  webMercatorUtils.xyToLngLat(event.graphic.geometry.extent.xmax,event.graphic.geometry.extent.ymax)
			bottomLeftXGlobal = minLatLong[0];
			bottomLeftYGlobal = minLatLong[1];
			topRightXGlobal = maxLatLong[0];
			topRightYGlobal = maxLatLong[1];
		
		}
              

	});

	var coordsWidget = document.createElement("div");
	coordsWidget.id = "coordsWidget";
	coordsWidget.className = "esri-widget esri-component";
	coordsWidget.style.padding = "7px 15px 5px";

	view.ui.add(coordsWidget, "bottom-right");

	var downloadAction = {
		title: "Download Data",
		id: "download-action",
		image: "images/download-icon-256.png"
	};

	view.popup.on("trigger-action", function (event) {
		// Execute the measureThis() function if the measure-this action is clicked
		if (event.action.id === "download-action") {
			view.popup.actions.removeAll(); // to prevent clicking the download again
			
			view.popup.content = "Determining files to download..."
			downloadModelData();
		}
	});

	// display the download tooltip containing the results from the selected search
	function downloadDialog(topRightPoint) {

		// close dialog if there's already one up.
		view.popup.close();
		view.popup.clear();

		view.popup.open({
			title: "Model Data For Area",
			actions: [downloadAction],
			content: "Click the download icon to download your data",
			location: { latitude: topRightPoint.latitude, longitude: topRightPoint.longitude }
		});
	}

	// reads the config file into memory, replacing the parameters using the user selected data
	function getConfig(url,
		isyear,
		ismonth,
		isday,
		ishour,
		ieyear,
		iemonth,
		ieday,
		iehour,
		ni1,
		ni2,
		nj1,
		nj2) {
		// read text from URL location
		var request = new XMLHttpRequest();
		request.open('GET', url, false);
		request.send(null);
		if (request.status === 200) {
			var configText = request.responseText;
			configText = configText.replace("! ISYEAR = 2012 !", "! ISYEAR = ".concat(isyear).concat(" !"));
			configText = configText.replace("! ISMONTH = 1 !", "! ISMONTH = ".concat(ismonth).concat(" !"));
			configText = configText.replace("! ISDAY = 1 !", "! ISDAY = ".concat(isday).concat(" !"));
			configText = configText.replace("! ISHOUR = 0 !", "! ISHOUR = ".concat(ishour).concat(" !"));

			configText = configText.replace("! IEYEAR = 2012 !", "! IEYEAR = ".concat(ieyear).concat(" !"));
			configText = configText.replace("! IEMONTH = 3 !", "! IEMONTH = ".concat(iemonth).concat(" !"));
			configText = configText.replace("! IEDAY = 1 !", "! IEDAY = ".concat(ieday).concat(" !"));
			configText = configText.replace("! IEHOUR = 0 !", "! IEHOUR = ".concat(iehour).concat(" !"));

			configText = configText.replace("! NI1 = 2 !", "! NI1 = ".concat(ni1).concat(" !"));
			configText = configText.replace("! NI2 = 3 !", "! NI2 = ".concat(ni2).concat(" !"));
			configText = configText.replace("! NJ1 = 392 !", "! NJ1 = ".concat(nj1).concat(" !"));
			configText = configText.replace("! NJ2 = 392 !", "! NJ2 = ".concat(nj2).concat(" !"));

			return configText;
		} else {
			return "";
		}
	}

	// calculate the largest J value less than the southern boundary that the user selected
	function calculateMinimumJ(latitude, previousMinJ = 2, previousMaxJ = MAX_J,  minI = 2, maxI = MAX_I) {

		var minJ = 2;

		for (var jScan = 2; jScan <= MAX_J; jScan++) {

			var inDomain = true;

			// ignore j values outside the boundaries of any previous searches
			if (jScan < previousMinJ || jScan > previousMaxJ) {
				continue;
			}

			// see if there are any values at the current J where all js are inside the boundary
			for (var n = 3; n < lines.length; n++) {
				var currentLine = lines[n].split(",");
				var currentI = parseInt(currentLine[0]);
				var currentJ = parseInt(currentLine[1]);
				var currentLatitude = parseFloat(currentLine[2]);

				// constrain based on min/max i values
				if (currentI < minI || currentI > maxI || jScan < previousMinJ || jScan > previousMaxJ) {
					continue;
				}

				// we're only checking j values that match jScan.  More specifically, we're
				// ensuring that for each jScan value, every corresponding j is less than the southern latitude entered by the user
				if (jScan == currentJ && currentLatitude >= latitude) {
					inDomain = false;
				}
			}

			if (inDomain && jScan > minJ) {
				minJ = jScan;
			}
			
		}
		return (minJ);
	}

	// calculate the largest J value less than the southern boundary that the user selected
	// Default parameters are used if we haven't yet calculated the J or I values
	function calculateMaximumJ(latitude, previousMinJ = 2, previousMaxJ = MAX_J,  minI = 2, maxI = MAX_I) {

		var maxJ = MAX_J;

		for (var jScan = 2; jScan <= 425; jScan++) {

			var inDomain = true;

			// ignore j values outside the boundaries of any previous searches
			if (jScan < previousMinJ || jScan > previousMaxJ) {
				continue;
			}

			// see if there are any values at the current J where all js are inside the boundary
			for (var n = 3; n < lines.length; n++) {
				var currentLine = lines[n].split(",");
				var currentI = parseInt(currentLine[0]);
				var currentJ = parseInt(currentLine[1]);
				var currentLatitude = parseFloat(currentLine[2]);

				// constrain based on min/max i values
				if (currentI < minI || currentI > maxI || jScan < previousMinJ || jScan > previousMaxJ) {
					continue;
				}

				// we're only checking j values that match jScan.  More specifically, we're
				// ensuring that for each jScan value, every corresponding j is greater than the northernmost latitude entered by the user
				if (jScan != currentJ) {
					continue;
				}

				// we're only checking j values that match jScan.  More specifically, we're
				// ensuring that for each jScan value, every corresponding j is greater than the northernmost latitude entered by the user
				if (jScan == currentJ && currentLatitude <= latitude) {
					inDomain = false;
				}
			}

			if (inDomain && jScan < maxJ) {
				maxJ = jScan;
			}
			
		}
		return (maxJ);
	}

	// calculate the largest I value less than the western boundary that the user selected, constrained by the norther/southern boundaries selected by the user
	function calculateMinimumI(longitude, maxJ) {
		var minI = 2;
		var previousLongitude = -200;

		for (var n = 3; n < lines.length; n++) {
			var currentLine = lines[n].split(",");
			var currentI = parseInt(currentLine[0]);
			var currentLongitude = parseFloat(currentLine[3]);
			var currentJ = parseInt(currentLine[1]);

			if ((currentJ == maxJ) && (currentLongitude > previousLongitude) && (currentLongitude < longitude)) {
				previousLongitude = currentLongitude;
				minI = currentI;
			}
		}
		return minI;
	}

	// calculate the smallest I value greater than the eastern boundary that the user selected, constrained by the norther/southern boundaries selected by the user
	function calculateMaximumI(longitude, maxJ) {
		var maxI = 2;
		var previousLongitude = 200;

		for (var n = 3; n < lines.length; n++) {
			var currentLine = lines[n].split(",");
			var currentI = parseInt(currentLine[0]);
			var currentLongitude = parseFloat(currentLine[3]);
			var currentJ = parseInt(currentLine[1]);

			if ((currentJ == maxJ) && (currentLongitude < previousLongitude) && (currentLongitude > longitude)) {
						   previousLongitude = currentLongitude;
						   maxI = currentI;
			}
		}
		
		return maxI;
	}


	// tiles have i/j coordinates ending in 2 (since each tile is 10 square kms and the i/j values start at 2)
	// Given a number n, this function returns the greatest number less than or equal to n that ends in 2.  
	function calculateMinimumTileNumber(n) {
		if (n % 10 == 2) {
			return n;
		} else if (n < 12) {
			n = 2;
		} else if (n % 10 < 2) {
			n = n - 10 - (n % 10) + 2;

		} else {
			n = n - (n % 10) + 2;
		}

		return n;
	}

	// tiles have i/j coordinates ending in 2 (since each tile is 10 square kms and the i/j values start at 2)
	// Given a number n, this function returns the smallest number greater than or equal to n that ends in 2.  
	function calculateMaximumTileNumber(n) {
		if (n % 10 == 2) {
			return n;
		} else if (n < 12) {
			n = 12;
		} else if (n % 10 < 2) {
			n = n + (n % 10);

		} else {
			n = n + (n % 10) + 2;
		}

		return n;
	}

	// download the data from the objects store
	function downloadModelData() {

		var urls = [];
		var zip = new JSZip();
		var count = 0;
		var zipFilename = "nr-wrf.zip";

		var baseUrl = "https://nrs.objectstore.gov.bc.ca/kadkvt/";

		var timezoneOffset = parseInt($('input[name="timezone"]:checked').val());


		var startDate = $("#startDate").datetimepicker('getDate');
		var endDate = $("#endDate").datetimepicker('getDate');

		// factor in the timezone
		startDate.setHours(startDate.getHours() + timezoneOffset);
		endDate.setHours(endDate.getHours() + timezoneOffset);


		var startYear = startDate.getFullYear();
		var startMonth = startDate.getMonth() + 1;
		var startDay = startDate.getDate();
		var startHour = startDate.getHours();

		var endYear = endDate.getFullYear();
		var endMonth = endDate.getMonth() + 1;
		var endDay = endDate.getDate();
		var endHour = endDate.getHours();

		var minJ = calculateMinimumJ(bottomLeftYGlobal);
		console.log("minJ: " + minJ);
		
		var maxJ = calculateMaximumJ(topRightYGlobal, minJ);
		console.log("maxJ: " + maxJ)

		var minI = calculateMinimumI(bottomLeftXGlobal, minJ, maxJ);
		console.log("minI: " + minI);
		
		var maxI = calculateMaximumI(topRightXGlobal, minJ, maxJ);
		console.log("maxI: " + maxI);
				
		minJ = calculateMinimumJ(bottomLeftYGlobal, minJ, maxJ, minI, maxI);
		console.log("Refined minJ: " + minJ);
		
		maxJ = calculateMaximumJ(topRightYGlobal, minJ, maxJ, minI, maxI);
		console.log("Refined maxJ: " + maxJ);
		

		for (var i = calculateMinimumTileNumber(minI); i <= maxI; i += 10) {
			for (var j = calculateMinimumTileNumber(minJ); j <= maxJ; j += 10) {
				var x1 = String("000" + i).slice(-3); //left pad x1 with zeroes
				var y1 = String("000" + j).slice(-3);
				var x2 = String("000" + (i + 9)).slice(-3);
				var y2 = String("000" + (j + 9)).slice(-3);

				var startingDate = new Date();
				startingDate.setFullYear(startDate.getFullYear());
				startingDate.setMonth(startDate.getMonth());

				var endingDate = new Date();
				endingDate.setFullYear(endDate.getFullYear());
				endingDate.setMonth(endDate.getMonth());

				for (var tileDate = startingDate; tileDate < endingDate; tileDate.setMonth(tileDate.getMonth() + 1)) {
					var year = tileDate.getFullYear();
					var month = tileDate.getMonth() + 1;
					month = String("00" + month).slice(-2);
					var fileName = "x" + x1 + "y" + y1 + "x" + x2 + "y" + y2 + "." + year + "" + month + ".10x10.m3d.7z";

					urls.push(baseUrl + fileName);

				}
			}

		}

		// generate the m3d_bild_temp.ini file based on user selected parameters
		var stitchingConfig = getConfig(baseUrl + "m3d_bild_temp.inp",
			startYear,
			startMonth,
			startDay,
			startHour,
			endYear,
			endMonth,
			endDay,
			endHour,
			minI,
			maxI,
			minJ,
			maxJ
		);

		if (urls.length > 500) {
			alert("The area you have selected contains more than 500 files for the given date range.  Please constrain your search to a small area or time period.");
			view.popup.close();
			view.popup.clear();

			return;
		}

		view.popup.content = "Preparing download... please wait";

		zip.file("m3d_bild.inp", stitchingConfig);

		// add the files required to unzip all the files, and process them
		urls.push(baseUrl + "7z.exe");
		urls.push(baseUrl + "m3d_bild.exe");
		urls.push(baseUrl + "start.bat");
		urls.push(baseUrl + "readme.txt");

		urls.forEach(function (url) {
			var msg = "Downloading Files";
			// loading a file and add it in a zip file
			JSZipUtils.getBinaryContent(url, function (err, data) {
				if (err) {
					throw err; // or handle the error
				}
				count++;
				msg = "Downloading file " + count + " of " + (urls.length + 1);
				view.popup.content = "<div>" + msg + "</div>";
				// add the zip file
				zip.file(url.substring(url.lastIndexOf('/') + 1), data, { binary: true });
				if (count == urls.length) {
					zip.generateAsync({ type: 'blob' }, function updateCallback(metadata) {
						msg = "Packaging Download : " + metadata.percent.toFixed(2) + "%";
						view.popup.content = msg;
					})
						.then(function callback(content) {
							view.popup.close();
							view.popup.clear();
							graphicsLayer.removeAll();
							saveAs(content, zipFilename);
						});
				}
			});
		});

	}

	clearResults = function() {
		view.popup.close();
							view.popup.clear();
							graphicsLayer.removeAll();
	}

	// Perform the "Search 1" function.  Given a point (lat/long), draw a square
	// equidistance from the point using the distance provided by distanceFromPoint
	search1 = function () {

		var s1Latitude = $("#s1Latitude").val();
		var s1Longitude = $("#s1Longitude").val();
		var distanceFromPoint = $("#distanceFromPoint").val();
		var s1StartDate = $("#startDate").val();
		var s1EndDate = $("#endDate").val();

		if (!validateDate(s1StartDate)) {
			return;
		}

		if (!validateDate(s1EndDate)) {
			return;
		}

		if (!validateDateSelection(s1StartDate, s1EndDate)) {
			return;
		}

		if (s1Longitude >= 0) {
			alert("Longitude values must be negative");
			return;
		} 

		if (isNaN(s1Latitude) || s1Latitude == 0) {
			alert("You must enter a valid latitude in the format ##.######");
			return;
		}
		if (isNaN(s1Longitude) || s1Longitude == 0) {
			alert("You must enter a valid longitude in the format ##.######");
			return;
		}

		if (s1Latitude > 63 || s1Latitude < 45 || s1Longitude < -146 || s1Longitude > -106) {
			alert("You have entered a coordinate outside of the bounds of this application.");
			return;
		}


		distanceFromPoint = distanceFromPoint * 1000; // convert km to meters

		var centerPoint = {
			latitude: s1Latitude,
			longitude: s1Longitude
		};
		var leftPoint = geodesicUtils.pointFromDistance(
			new Point(
				{ x: centerPoint.longitude, y: centerPoint.latitude }
			),
			distanceFromPoint,
			270);
		var rightPoint = geodesicUtils.pointFromDistance(
			new Point(
				{ x: centerPoint.longitude, y: centerPoint.latitude }
			),
			distanceFromPoint,
			90);

		var topRightPoint = geodesicUtils.pointFromDistance(
			rightPoint,
			distanceFromPoint,
			0);

		var bottomRightPoint = geodesicUtils.pointFromDistance(
			rightPoint,
			distanceFromPoint,
			180);
		var topLeftPoint = geodesicUtils.pointFromDistance(
			leftPoint,
			distanceFromPoint,
			0);
		var bottomLeftPoint = geodesicUtils.pointFromDistance(
			leftPoint,
			distanceFromPoint,
			180);
		bottomLeftXGlobal = bottomLeftPoint.longitude;
		bottomLeftYGlobal = bottomLeftPoint.latitude;
		topRightXGlobal = topRightPoint.longitude;
		topRightYGlobal = topRightPoint.latitude;


		var polygon = {
			type: "polygon",
			rings: [
				[topLeftPoint.longitude, topLeftPoint.latitude],
				[topRightPoint.longitude, topRightPoint.latitude],
				[bottomRightPoint.longitude, bottomRightPoint.latitude],
				[bottomLeftPoint.longitude, bottomLeftPoint.latitude],
				[topLeftPoint.longitude, topLeftPoint.latitude]
			]
		};

		var simpleFillSymbol = {
			type: "simple-fill",
			color: [227, 139, 79, 0.8], // orange, opacity 80%
			outline: {
				color: [255, 255, 255],
				width: 1
			}
		};

		var polygonGraphic = new Graphic({
			geometry: polygon,
			symbol: simpleFillSymbol
		});



		graphicsLayer.removeAll();
		graphicsLayer.add(polygonGraphic);

		view.center = polygonGraphic.geometry.centroid;

		




		downloadDialog(topRightPoint);
	}


	// Perform the "Search 2" function.  Given two points (bottom left and upper right),
	// draw a rectangle
	search2 = function () {

		var s2Latitude1 = $("#s2Latitude1").val();
		var s2Longitude1 = $("#s2Longitude1").val();
		var s2Latitude2 = $("#s2Latitude2").val();
		var s2Longitude2 = $("#s2Longitude2").val();
		var s2StartDate = $("#startDate").val();
		var s2EndDate = $("#endDate").val();

		bottomLeftXGlobal = s2Longitude1;
		bottomLeftYGlobal = s2Latitude1;
		topRightXGlobal = s2Longitude2;
		topRightYGlobal = s2Latitude2;

		var s2Point1Offset = geodesicUtils.pointFromDistance(
			new Point(
				{ x: s2Longitude1, y: s2Latitude1 }
			),
			0,
			270);

		s2Point1Offset = geodesicUtils.pointFromDistance(
			new Point(
				{ x: s2Point1Offset.longitude, y: s2Point1Offset.latitude }
			),
			0,
			180);

		var s2Point2Offset = geodesicUtils.pointFromDistance(
			new Point(
				{ x: s2Longitude2, y: s2Latitude2 }
			),
			0,
			0);

		s2Point2Offset = geodesicUtils.pointFromDistance(
			new Point(
				{ x: s2Point2Offset.longitude, y: s2Point2Offset.latitude }
			),
			0,
			90);


		if (!validateDate(s2StartDate)) {
			return;
		}

		if (!validateDate(s2EndDate)) {
			return;
		}

		if (!validateDateSelection(s2StartDate, s2EndDate)) {
			return;
		}

		if (s2Longitude1 >= 0) {
			alert("Longitude values must be negative");
			return;
		} 

		if (s2Longitude2 >= 0) {
			alert("Longitude values must be negative");
			return;
		} 

		if (isNaN(s2Latitude1) || s1Latitude == 0) {
			alert("You must enter a valid latitude in the format ##.######");
			return;
		}
		if (isNaN(s2Longitude1) || s1Longitude == 0) {
			alert("You must enter a valid longitude in the format ##.######");
			return;
		}

		if (isNaN(s2Latitude2) || s1Latitude == 0) {
			alert("You must enter a valid latitude in the format ##.######");
			return;
		}
		if (isNaN(s2Longitude2) || s1Longitude == 0) {
			alert("You must enter a valid longitude in the format ##.######");
			return;
		}

		if (s2Latitude1 > 63 || s2Latitude1 < 45 || s2Longitude1 < -146 || s2Longitude1 > -106 || s2Latitude2 > 63 || s2Latitude2 < 45 || s2Longitude2 < -146 || s2Longitude2 > -106) {
			alert("You have entered a coordinate outside of the bounds of this application.");
			return;
		}

		var polygon = {
			type: "polygon",
			rings: [
				[s2Point1Offset.longitude, s2Point1Offset.latitude],
				[s2Point1Offset.longitude, s2Point2Offset.latitude],
				[s2Point2Offset.longitude, s2Point2Offset.latitude],
				[s2Point2Offset.longitude, s2Point1Offset.latitude],
				[s2Point1Offset.longitude, s2Point1Offset.latitude]
			]
		};

		var simpleFillSymbol = {
			type: "simple-fill",
			color: [227, 139, 79, 0.8], // orange, opacity 80%
			outline: {
				color: [255, 255, 255],
				width: 1
			}
		};

		var polygonGraphic = new Graphic({
			geometry: polygon,
			symbol: simpleFillSymbol
		});

		var maxLongitude = Math.max(s2Longitude1, s2Longitude2);
		var maxLatitude = Math.max(s2Latitude1, s2Latitude2);

		graphicsLayer.removeAll();
		graphicsLayer.add(polygonGraphic);

		view.center = [maxLongitude, maxLatitude];

		downloadDialog({ latitude: maxLatitude, longitude: maxLongitude });


	}

	search3 = function () {

		var s3StartDate = $("#startDate").val();
		var s3EndDate = $("#endDate").val();


		if (!validateDate(s3StartDate)) {
			return;
		}

		if (!validateDate(s3EndDate)) {
			return;
		}

		if (graphicsLayer.graphics.length < 1) {
			alert("Please draw a rectangle to mark your selection");
			return;
		}

		view.center = graphicsLayer.graphics.getItemAt(0).geometry.centroid;

		downloadDialog({ latitude: topRightYGlobal, longitude: topRightXGlobal });

		
	}

	sketch.on("create", function (event) {
		// clear the screen of any popups or previous graphics
		if (event.state === "start") {
			view.popup.close();
			view.popup.clear();
			graphicsLayer.removeAll();
		}
	});

	// convex hull of data points to form the boundary on the screen
	const boundaryPolygon = {
		type: "polygon",
		rings: [
			[-137.674,46.4292],
			[-137.769,46.7831],
			[-137.865,47.1373],
			[-137.963,47.4916],
			[-138.063,47.846],
			[-138.164,48.2007],
			[-138.266,48.5555],
			[-138.37,48.9104],
			[-138.476,49.2655],
			[-138.584,49.6207],
			[-138.693,49.976],
			[-138.804,50.3313],
			[-138.916,50.6868],
			[-139.031,51.0422],
			[-139.147,51.3977],
			[-139.265,51.7533],
			[-139.386,52.1088],
			[-139.508,52.4643],
			[-139.632,52.8198],
			[-139.759,53.1753],
			[-139.887,53.5307],
			[-140.018,53.886],
			[-140.151,54.2412],
			[-140.287,54.5964],
			[-140.424,54.9514],
			[-140.565,55.3062],
			[-140.708,55.6609],
			[-140.853,56.0154],
			[-141.001,56.3697],
			[-141.152,56.7238],
			[-141.306,57.0776],
			[-141.462,57.4312],
			[-141.622,57.7845],
			[-141.785,58.1375],
			[-141.95,58.4902],
			[-142.119,58.8426],
			[-142.292,59.1946],
			[-142.468,59.5462],
			[-142.647,59.8974],
			[-142.83,60.2482],
			[-143.016,60.5986],
			[-143.207,60.9485],
			[-143.402,61.2979],
			[-143.402,61.2979],
[-142.673,61.3905],
[-141.94,61.4794],
[-141.203,61.5645],
[-140.462,61.646],
[-139.718,61.7236],
[-138.97,61.7975],
[-138.219,61.8675],
[-137.465,61.9337],
[-136.708,61.996],
[-135.949,62.0545],
[-135.186,62.109],
[-134.422,62.1597],
[-133.654,62.2064],
[-132.885,62.2491],
[-132.114,62.2879],
[-131.341,62.3227],
[-130.567,62.3535],
[-129.791,62.3803],
[-129.014,62.403],
[-128.236,62.4218],
[-127.457,62.4365],
[-126.677,62.4472],
[-125.897,62.4539],
[-125.117,62.4565],
[-124.337,62.4551],
[-123.557,62.4496],
[-122.777,62.4402],
[-121.998,62.4266],
[-121.22,62.4091],
[-120.442,62.3875],
[-119.666,62.3619],
[-118.891,62.3323],
[-118.118,62.2987],
[-117.346,62.2612],
[-116.576,62.2196],
[-115.808,62.1741],
[-115.043,62.1246],
[-114.28,62.0713],
[-113.519,62.014],
[-112.761,61.9528],
[-112.007,61.8878],
[-111.255,61.8189],
[-110.506,61.7462],
[-109.761,61.6696],
[-109.019,61.5893],
[-108.281,61.5053],
[-107.547,61.4175],
[-107.547,61.4175],
[-107.732,61.067],
[-107.914,60.7159],
[-108.092,60.3644],
[-108.266,60.0125],
[-108.437,59.6602],
[-108.604,59.3075],
[-108.768,58.9544],
[-108.929,58.601],
[-109.087,58.2473],
[-109.242,57.8933],
[-109.394,57.539],
[-109.543,57.1844],
[-109.689,56.8296],
[-109.833,56.4745],
[-109.973,56.1193],
[-110.112,55.7639],
[-110.248,55.4083],
[-110.381,55.0525],
[-110.512,54.6966],
[-110.641,54.3406],
[-110.768,53.9845],
[-110.892,53.6283],
[-111.014,53.2721],
[-111.134,52.9158],
[-111.253,52.5595],
[-111.369,52.2031],
[-111.483,51.8468],
[-111.595,51.4904],
[-111.706,51.1341],
[-111.815,50.7779],
[-111.922,50.4217],
[-112.027,50.0655],
[-112.131,49.7095],
[-112.233,49.3536],
[-112.333,48.9978],
[-112.432,48.6421],
[-112.529,48.2866],
[-112.625,47.9312],
[-112.72,47.576],
[-112.813,47.221],
[-112.904,46.8662],
[-112.995,46.5116],
[-112.995,46.5116],
[-113.51,46.572],
[-114.027,46.6298],
[-114.546,46.6849],
[-115.065,46.7374],
[-115.586,46.7872],
[-116.107,46.8343],
[-116.63,46.8788],
[-117.153,46.9206],
[-117.678,46.9598],
[-118.203,46.9962],
[-118.729,47.0299],
[-119.255,47.0609],
[-119.783,47.0893],
[-120.311,47.1148],
[-120.839,47.1377],
[-121.368,47.1578],
[-121.898,47.1753],
[-122.428,47.1899],
[-122.958,47.2019],
[-123.488,47.211],
[-124.018,47.2175],
[-124.549,47.2212],
[-125.08,47.2222],
[-125.61,47.2204],
[-126.141,47.2158],
[-126.671,47.2086],
[-127.202,47.1986],
[-127.732,47.1858],
[-128.261,47.1703],
[-128.791,47.1521],
[-129.319,47.1311],
[-129.848,47.1075],
[-130.376,47.081],
[-130.903,47.0519],
[-131.429,47.0201],
[-131.955,46.9855],
[-132.48,46.9483],
[-133.004,46.9084],
[-133.527,46.8658],
[-134.05,46.8205],
[-134.571,46.7725],
[-135.091,46.7219],
[-135.61,46.6686],
[-136.128,46.6127],
[-136.644,46.5542],
[-137.16,46.493],
[-137.674,46.4292]
		]
	 };
	const simpleFillSymbol = {
		type: "simple-fill",
		color: [227, 139, 79, 0.1],  // Orange, opacity 80%
		outline: {
			color: [0, 0, 0],
			width: 1
		}
	 };
	 const polygonBoundaryGraphic = new Graphic({
		geometry: boundaryPolygon,
		symbol: simpleFillSymbol,
	
	 });
	 map.add(boundaryGraphicsLayer);
	 boundaryGraphicsLayer.add(polygonBoundaryGraphic);


	

});