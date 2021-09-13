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
			 geodesicUtils) {

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
      
      var coordsWidget = document.createElement("div");
      coordsWidget.id = "coordsWidget";
      coordsWidget.className = "esri-widget esri-component";
      coordsWidget.style.padding = "7px 15px 5px";

      view.ui.add(coordsWidget, "bottom-right");
      
	  function setContentInfo(feature) {
		alert(feature);
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
		
		function urlToPromise(url) {
			return new Promise(function(resolve, reject) {
			JSZipUtils.getBinaryContent(url, function (err, data) {
				if(err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
			});
		}
		
		function download(graphics) {
			
			var zip = new JSZip();			
			
			graphics.forEach((result, index) => {
				const attributes = result.attributes;
				var fileName = attributes.filename;
				var url = "https://nrs.objectstore.gov.bc.ca/kadkvt/" +  fileName;
				objectStorage = attributes.objectstorage;
				zip.file(fileName, urlToPromise(url), {binary:true});

			});
				
			zip.generateAsync({type:"blob"})
				.then(function callback(blob) {
				// see FileSaver.js
				saveAs(blob, "nr-wrf.zip");
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
			var bottomPoint = geodesicUtils.pointFromDistance(
					new Point(
							{x: centerPoint.longitude, y: centerPoint.latitude}
					),
					distanceFromPoint,
					180);
			var topPoint = geodesicUtils.pointFromDistance(
					new Point(
							{x: centerPoint.longitude, y: centerPoint.latitude}
					),
					distanceFromPoint,
					0);

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

			const modelQuery = {
			         spatialRelationship: "intersects", // Relationship operation to apply
			         geometry: polygon,  // The sketch feature geometry
			         returnGeometry: true,
			         where: "date >= '" + s1StartDate + "' and date <= '" + s1EndDate + "'",
			         outFields: ["*"]
			};
			
			var downloadAction = {
				title: "Download Data",
				id: "download-action",
				image: "images/download-icon-256.png"
			};
			
			
			layer.queryFeatures(modelQuery)
	        .then((results) => {

	            console.log("Feature count: " + results.features.length);
				view.popup.on("trigger-action", function(event) {
					// Execute the measureThis() function if the measure-this action is clicked
					if (event.action.id === "download-action") {
						download(results.features);
					}
				});
      
				view.popup.open({
								title: "Model Data For Area",
								actions: [downloadAction],
								content: "Click the download icon to download your data",
                                location: {latitude: topRightPoint.latitude, longitude: topRightPoint.longitude}
                            });
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
			graphicsLayer.removeAll();
			graphicsLayer.add(polygonGraphic);    
	}
      
      
    
    
    
    
    map.add(layer);


});