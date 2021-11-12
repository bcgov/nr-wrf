require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/layers/GraphicsLayer",
  "esri/widgets/Sketch",
  "esri/Graphic",
  "esri/geometry/Point",
  "esri/geometry/support/geodesicUtils",
  "esri/widgets/CoordinateConversion",
  "dojo/domReady!"
], function (esriConfig,
			 Map, 
			 MapView, 
			 FeatureLayer, 
			 GraphicsLayer, 
			 Sketch, 
			 Graphic, 
			 Point, 
			 geodesicUtils,
			 CoordinateConversion) {
	
	var lines;

				fetch('../../data/domaininfo_bcwrf.csv')
				.then(function(response) {
				return response.text()
			})
			.then(function(csv) {

				// each line has the format I,J,LAT,LON
				lines = csv.split("\n");
			});

      const graphicsLayer = new GraphicsLayer();
      esriConfig.apiKey = "AAPK1c42e0bed09a4c5e9cd405eb8aa385be8iJCXX-m6zsVighHNzd5NLLVAhwtmAUOE5ZqrPseB8GuryyEHumQSDFtQJjjY3g_";
      const map = new Map({
        basemap: "arcgis-topographic", // Basemap layer
        layers: [graphicsLayer]
      });
      const layer = new FeatureLayer("https://services3.arcgis.com/U26uBjSD32d7xvm2/arcgis/rest/services/wrf_fileindex/FeatureServer",
    		  	{
    	  			visible: false,
					outFields: ["*"]
    		  	});
      const view = new MapView({
        map: map,
        center: [-124.8563, 55.6913],
        zoom: 6, // scale: 72223.819286
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
			  selectionTools:{
				"lasso-selection": false,
				"rectangle-selection": false,
				"pointer-selection": false /* this has no effect - I don't know the correct name for this tool */
			  },
			  undoRedoMenu: false
		  },
		  container: document.getElementById("sketchdiv")
          // graphic will be selected as soon as it is created
          
        });

      var coordsWidget = document.createElement("div");
	  var graphics;
      coordsWidget.id = "coordsWidget";
      coordsWidget.className = "esri-widget esri-component";
      coordsWidget.style.padding = "7px 15px 5px";

      view.ui.add(coordsWidget, "bottom-right");

	  var downloadAction = {
		title: "Download Data",
		id: "download-action",
		image: "images/download-icon-256.png"
	  };

	  view.popup.on("trigger-action", function(event) {
		// Execute the measureThis() function if the measure-this action is clicked
		if (event.action.id === "download-action") {
			view.popup.actions.removeAll(); // to prevent clicking the download again
			view.popup.content = "Preparing download... please wait";
			
			downloadModelData();
		}
	});

		// display the download tooltip containing the results from the selected search
		function downloadDialog(results, topRightPoint) {
		  				console.log("Feature count: " + results.features.length);

				// close dialog if there's already one up.
				view.popup.close();
				view.popup.clear();
						
				if (results.features.length == 0) {
					alert("No shape files were found in the selected area");
				} else if (results.features.length > 5000) {
					alert("The area you have selected contains more than 50 files.  Please constrain your search to a small area or time period.");
				} else {
					graphics = results.features;
					view.popup.open({
									title: "Model Data For Area",
									actions: [downloadAction],
									content: results.features.length + " files in selected area.  Click the download icon to download your data",
									location: {latitude: topRightPoint.latitude, longitude: topRightPoint.longitude}
								});
								
				}
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
						   nj2){
			// read text from URL location
			var request = new XMLHttpRequest();
			request.open('GET', url, false);
			request.send(null);
			if (request.status === 200) {
				var configText = request.responseText;
				configText = configText.replace("! ISYEAR = 2012 !","! ISYEAR = ".concat(isyear).concat(" !"));
				configText = configText.replace("! ISMONTH = 1 !","! ISMONTH = ".concat(ismonth).concat(" !"));
				configText = configText.replace("! ISDAY = 1 !","! ISDAY = ".concat(isday).concat(" !"));
				configText = configText.replace("! ISHOUR = 0 !","! ISHOUR = ".concat(ishour).concat(" !"));

				configText = configText.replace("! IEYEAR = 2012 !","! IEYEAR = ".concat(ieyear).concat(" !"));
				configText = configText.replace("! IEMONTH = 3 !","! IEMONTH = ".concat(iemonth).concat(" !"));
				configText = configText.replace("! IEDAY = 1 !","! IEDAY = ".concat(ieday).concat(" !"));
				configText = configText.replace("! IEHOUR = 0 !","! IEHOUR = ".concat(iehour).concat(" !"));

				configText = configText.replace("! NI1 = 2 !","! NI1 = ".concat(ni1).concat(" !"));
				configText = configText.replace("! NI2 = 3 !","! NI2 = ".concat(ni2).concat(" !"));
				configText = configText.replace("! NJ1 = 392 !","! NJ1 = ".concat(nj1).concat(" !"));
				configText = configText.replace("! NJ2 = 392 !","! NJ2 = ".concat(nj2).concat(" !"));
				
				return configText;
			} else {
				return "";
			}
		}

		function calculateMinimumJ(latitude) {

				var minJ = 2;
				var previousJ = 2;
				var potentialJ = true;
				
				for (var n = 3; n<lines.length; n++) {
					var currentLine = lines[n].split(",");
					var currentJ = parseInt(currentLine[1]);
					var currentLatitude = parseFloat(currentLine[2]);
					
					if (currentLatitude > latitude) {
						potentialJ = false;
					}
					// new J, reset the search
					if (previousJ != currentJ && potentialJ) {
						//alert(previousJ + " " + currentJ + " " + minJ);
						if (previousJ > minJ) {
							minJ = previousJ;
							//alert(minJ);
						}
						potentialJ = true;
					} else if (previousJ != currentJ) {
						potentialJ = true;
					}
					previousJ = currentJ;

					
					
				}
				return (minJ);
		}

		function calculateMaximumJ(latitude) {
				var maxJ = 425;
				var previousJ = 425;
				var potentialJ = true;
				
				for (var n = 3; n<lines.length; n++) {
					var currentLine = lines[n].split(",");
					var currentJ = parseInt(currentLine[1]);
					var currentLatitude = parseFloat(currentLine[2]);
					
					if (currentLatitude < latitude) {
						potentialJ = false;
					}
					// new J, reset the search
					if ((previousJ != currentJ) && potentialJ) {
						//alert(previousJ + " " + currentJ + " " + maxJ);
						if (previousJ < maxJ) {
							maxJ = parseInt(previousJ);
							//alert(maxJ);
						}
						potentialJ = true;
					} else if (previousJ != currentJ) {
						potentialJ = true;
					}

					previousJ = currentJ;
					
				}
				return (maxJ);
		}

		function calculateMinimumI(longitude, minJ, maxJ) {
				var minI = 2;
				var previousI = 2;
				var previousLongitude = -200;
				
				
				for (var n = 3; n<lines.length; n++) {
					var currentLine = lines[n].split(",");
					var currentI = parseInt(currentLine[0]);
					var currentLongitude = parseFloat(currentLine[3]);
					var currentJ = parseInt(currentLine[1]);
					
					if ((currentJ <= minJ) || (currentJ >= maxJ)) {
						continue;
					}

					if (currentLongitude > previousLongitude && currentLongitude < longitude) {
						minI = currentI;
					}


				}
				return (minI-1);
		}

		function calculateMaximumI(longitude, minJ, maxJ) {
				var minI = 2;
				var previousI = 2;
				var previousLongitude = 200;
				
				
				for (var n = 3; n<lines.length; n++) {
					var currentLine = lines[n].split(",");
					var currentI = parseInt(currentLine[0]);
					var currentLongitude = parseFloat(currentLine[3]);
					var currentJ = parseInt(currentLine[1]);
					
					if ((currentJ <= minJ) || (currentJ >= maxJ)) {
						continue;
					}

					if (currentLongitude < previousLongitude && currentLongitude > longitude) {
						previousLongitude = currentLongitude;
						minI = currentI;
					}


				}
				return (minI);
		}



		function calculateMinimumTileNumber(n) {
			if (n%10 == 2) {
				return n;
			} else if (n < 12) {
				n =2;	
			} else if (n%10 <2) {
				n = n - 10 - (n%10) + 2;
				
			} else {
				n = n - (n%10) + 2;
			}

			return n;
		}

		function calculateMaximumTileNumber(n) {
			if (n%10 == 1) {
				return n;
			} else if (n%10 <1) {
				n = n - 10 - (n%10) + 1;
			} else {
				n = n - (n%10) + 1;
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
			var maxJ = calculateMaximumJ(topRightYGlobal);
			var minI = calculateMinimumI(bottomLeftXGlobal, minJ, maxJ);
			var maxI = calculateMaximumI(topRightXGlobal, minJ, maxJ);

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

					for (var tileDate = startingDate; tileDate < endingDate; tileDate = tileDate.setMonth(tileDate.getMonth() + 1)) {
						var year = tileDate.getFullYear();
						var month = tileDate.getMonth() + 1;
						month = String("00" + month).slice(-2);
						var fileName = "x" + x1 + "y" + y1 + "x" + x2 + "y" + y2+ "." + year + "" + month + ".10x10.m3d.7z";
						alert(fileName);
						urls.push(baseUrl + fileName);
					}
				}

			}

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
			
			zip.file("m3d_bild.inp",stitchingConfig);


			
			
			// add the files required to unzip all the files, and process them
			urls.push(baseUrl + "7z.exe");
			urls.push(baseUrl + "m3d_bild.exe");
			//urls.push(baseUrl + "start.bat");
			//urls.push(baseUrl + "readme.txt");
			urls.forEach(function(url){
				var msg = "Downloading Files";
				// loading a file and add it in a zip file
				JSZipUtils.getBinaryContent(url, function (err, data) {
				   if(err) {
					  throw err; // or handle the error
				   }
				   count++;
				   msg = "Downloading file " + count + " of " + urls.length;
				   view.popup.content = "<div>" + msg + "</div>";
				   // add the zip file
				   zip.file(url.substring(url.lastIndexOf('/')+1), data, {binary:true});
				   
				   
					

				   
				   if (count == urls.length) {
					zip.generateAsync({type:'blob'}, function updateCallback(metadata) {
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
     
      // Perform the "Search 1" function.  Given a point (lat/long), draw a square
      // equidistance from the point using the distance provided by distanceFromPoint
      search1 = function() {  
	  
    	  	var s1Latitude = $("#s1Latitude").val();        
    	  	var s1Longitude = $("#s1Longitude").val(); 
			var distanceFromPoint = $("#distanceFromPoint").val();
			var s1StartDate = $("#startDate").val();
			var s1EndDate = $("#endDate").val();
    	  	
    	  	/*
			if (!validateDate(s1StartDate)) {
				return;
			}
			
			if (!validateDate(s1EndDate)) {
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
			*/
			distanceFromPoint = distanceFromPoint*1000; // convert km to meters
							
			var centerPoint = {
					latitude: s1Latitude,
					longitude: s1Longitude
			};
			var leftPoint = geodesicUtils.pointFromDistance(
					new Point(
							{x: centerPoint.longitude, y: centerPoint.latitude}
					),
					distanceFromPoint,
					270);
			var rightPoint = geodesicUtils.pointFromDistance(
					new Point(
							{x: centerPoint.longitude, y: centerPoint.latitude}
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

			const modelQuery = {
			         spatialRelationship: "intersects", // Relationship operation to apply
			         geometry: polygon,  // The sketch feature geometry
			         returnGeometry: true,
			         //where: "date >= '" + s1StartDate.substring(0, 10)  + "' and date <= '" + s1EndDate.substring(0, 10) + "'",
			         outFields: ["*"]
			};
			


			
			layer.queryFeatures(modelQuery)
	        .then((results) => {

	            downloadDialog(results, topRightPoint);
				
	          }).catch((error) => {
	            console.log(error);
	          });
		}
		
		
   	  // Perform the "Search 2" function.  Given two points (bottom left and upper right),
   	  // draw a rectangle
      search2 = function() {  
    	  
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
							{x: s2Longitude1, y: s2Latitude1}
					),
					0,
					270);

			s2Point1Offset = geodesicUtils.pointFromDistance(
					new Point(
							{x: s2Point1Offset.longitude, y: s2Point1Offset.latitude}
					),
					0,
					180);
					
			var s2Point2Offset = geodesicUtils.pointFromDistance(
					new Point(
							{x: s2Longitude2, y: s2Latitude2}
					),
					0,
					0);
		
			s2Point2Offset = geodesicUtils.pointFromDistance(
						new Point(
								{x: s2Point2Offset.longitude, y: s2Point2Offset.latitude}
						),
						0,
						90);

    	  	
			if (!validateDate(s2StartDate)) {
				return;
			}
			
			if (!validateDate(s2EndDate)) {
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

			view.center = [maxLongitude,maxLatitude]; 

			const modelQuery = {
			         spatialRelationship: "contains", // Relationship operation to apply
			         geometry: polygon,  // The sketch feature geometry
			         returnGeometry: true,
			         //where: "date >= '" + s2StartDate.substring(0, 10)  + "' and date <= '" + s2EndDate.substring(0, 10)  + "'",
			         outFields: ["*"]
			};
			


			
			layer.queryFeatures(modelQuery)
	        .then((results) => {

	            downloadDialog(results, {latitude: maxLatitude, longitude: maxLongitude});
				
	          }).catch((error) => {
	            console.log(error);
	          });
	}

	search3 = function() {  
    	  
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

	  const modelQuery = {
			   spatialRelationship: "intersects", // Relationship operation to apply
			   geometry: graphicsLayer.graphics.getItemAt(0).geometry,  // The sketch feature geometry
			   returnGeometry: true,
			   where: "date >= '" + s3StartDate.substring(0, 10)  + "' and date <= '" + s3EndDate.substring(0, 10)  + "'",
			   outFields: ["*"]
	  };
	  


		layer.queryFeatures(modelQuery)
	        .then((results) => {

            downloadDialog(results, graphicsLayer.graphics.getItemAt(0).geometry.centroid);
			
        }).catch((error) => {
            console.log(error);
        });

	}
	
	sketch.on("create", function(event) {
		// clear the screen of any popups or previous graphics
		if (event.state === "start") {
			view.popup.close();
			view.popup.clear();						
			graphicsLayer.removeAll();
		}
	});
      
      
    
    
    
    
    map.add(layer);


});