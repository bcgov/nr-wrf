require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/portal/Portal",
  "esri/identity/OAuthInfo",
  "esri/identity/IdentityManager",
  "esri/portal/PortalQueryParams",
  "esri/layers/GraphicsLayer",
  "esri/widgets/Sketch",
  "esri/views/2d/draw/Draw",
  "esri/Graphic",
  "esri/geometry/Polyline",
  "esri/geometry/Polygon",
  "esri/geometry/Point",
  "esri/geometry/Circle",
  "esri/geometry/support/geodesicUtils",
  "esri/geometry/Geometry",
  "esri/geometry/Extent",
  "dojo/domReady!"
], function (esriConfig,
			 Map, 
			 MapView, 
			 FeatureLayer, 
			 Portal, 
			 OAuthInfo, 
			 esriId, 
			 PortalQueryParams, 
			 GraphicsLayer, 
			 Sketch, 
			 Draw, 
			 Graphic, 
			 Polyline,
			 Polygon, 
			 Point, 
			 Circle, 
			 geodesicUtils,
			 Geometry,
			 Extent) {

      const graphicsLayer = new GraphicsLayer();
      esriConfig.apiKey = "AAPK1c42e0bed09a4c5e9cd405eb8aa385be8iJCXX-m6zsVighHNzd5NLLVAhwtmAUOE5ZqrPseB8GuryyEHumQSDFtQJjjY3g_";
      const map = new Map({
        basemap: "arcgis-topographic", // Basemap layer
        layers: [graphicsLayer]
      });
      const layer = new FeatureLayer("https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/wrf_fileindex/FeatureServer",
    		  	{
    	  			opacity: 0.1,
					outFields: ["*"]
    		  	});
      const view = new MapView({
        map: map,
        center: [-124.8563, 55.6913],
        zoom: 5, // scale: 72223.819286
        container: "viewDiv",
      });
	  
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
				if (results.features.length == 0) {
					alert("No shape files were found in the selected area");
				} else if (results.features.length > 50) {
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
      
      function showCoordinates(pt) {
    	  var coords =
    	    "Lat/Lon " +
    	    pt.latitude.toFixed(3) +
    	    " " +
    	    pt.longitude.toFixed(3) +
    	    " | Scale 1:" +
    	    Math.round(view.scale * 1) / 1 +
    	    " | Zoom " +
    	    view.zoom;
    	  coordsWidget.innerHTML = coords;
    	}
		
		// download the data from the objects store
		function downloadModelData() {

			var urls = [];
			var zip = new JSZip();
			var count = 0;
			var zipFilename = "nr-wrf.zip";
			
			// prepare a list of urls representing the files that we'll be downloading
			graphics.forEach((result, index) => {
				const attributes = result.attributes;
				var fileName = attributes.filename;
				var imageUrl = "https://nrs.objectstore.gov.bc.ca/kadkvt/" +  fileName;
				objectStorage = attributes.objectstorage;
				if (objectStorage.includes("kadkvt")) {
					urls.push(imageUrl);
				}

			})

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
     
      view.watch("stationary", function (isStationary) {
    	  showCoordinates(view.center);
    	});

    	view.on("pointer-move", function (evt) {
    	  showCoordinates(view.toMap({ x: evt.x, y: evt.y }));
    	});

      // Perform the "Search 1" function.  Given a point (lat/long), draw a square
      // equidistance from the point using the distance provided by distanceFromPoint
      search1 = function() {  
    	  
    	  	var s1Latitude = $("#s1Latitude").val();        
    	  	var s1Longitude = $("#s1Longitude").val(); 
			var distanceFromPoint = $("#distanceFromPoint").val();
			var s1StartDate = $("#s1StartDate").val();
			var s1EndDate = $("#s1EndDate").val();
    	  	
    	  	
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
			         where: "date >= '" + s1StartDate.substring(0, 10)  + "' and date <= '" + s1EndDate.substring(0, 10) + "'",
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
			var s2StartDate = $("#s2StartDate").val();
			var s2EndDate = $("#s2EndDate").val();
    	  	
    	  	
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
					    [s2Longitude1, s2Latitude1],
					    [s2Longitude1, s2Latitude2],
					    [s2Longitude2, s2Latitude2],
					    [s2Longitude2, s2Latitude1],
					    [s2Longitude1, s2Latitude1]
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
			         spatialRelationship: "intersects", // Relationship operation to apply
			         geometry: polygon,  // The sketch feature geometry
			         returnGeometry: true,
			         where: "date >= '" + s2StartDate.substring(0, 10)  + "' and date <= '" + s2EndDate.substring(0, 10)  + "'",
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
    	  
	  var s3StartDate = $("#s2StartDate").val();
	  var s3EndDate = $("#s2EndDate").val();
	  
		
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