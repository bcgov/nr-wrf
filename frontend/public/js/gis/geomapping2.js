require([
  'esri/config',
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/GraphicsLayer',
  'esri/widgets/Sketch',
  'esri/Graphic',
  'esri/geometry/Point',
  'esri/geometry/support/geodesicUtils',
  'esri/widgets/CoordinateConversion',
  'esri/geometry/support/webMercatorUtils',
  'esri/symbols/TextSymbol',
  'esri/layers/GraphicsLayer',
  'dojo/domReady!',
], function (
  esriConfig,
  Map,
  MapView,
  GraphicsLayer,
  Sketch,
  Graphic,
  Point,
  geodesicUtils,
  CoordinateConversion,
  webMercatorUtils,
  TextSymbol,
  GraphicsLayer
) {
  var zipFileUrl;
  var urlsLength = 6;

  const calpuffDomainColors = {
    d02: [144, 238, 144, 0.32], // light green
    d03: [82, 153, 255, 0.32],
    d04: [82, 153, 255, 0.32],
    d05: [82, 153, 255, 0.32],
    d06: [82, 153, 255, 0.32],
  };
  const calpuffDomainLayers = {};

  const graphicsLayer = new GraphicsLayer();
  const boundaryGraphicsLayer = new GraphicsLayer();

  const request = new XMLHttpRequest();
  request.open('GET', '/esriConfig', false);
  request.send(null);
  if (request.status === 200) {
    esriConfig.apiKey = request.responseText;
  }

  const map = new Map({
    basemap: 'arcgis-topographic', // Basemap layer
    layers: [graphicsLayer],
  });
  const view = new MapView({
    map: map,
    center: [-124.8563, 55.1],
    zoom: 5, // scale: 72223.819286
    container: 'viewDiv',
  });

  const ccWidget = new CoordinateConversion({
    view: view,
  });

  var bottomLeftXGlobal;
  var bottomLeftYGlobal;
  var topRightXGlobal;
  var topRightYGlobal;

  view.ui.add(ccWidget, 'bottom-right');

  function initCalpuffDomainLayers() {
    console.log('initCalpuffDomainLayers');
    Object.keys(calpuffDomainColors).forEach(function (domain) {
      if (!calpuffDomainLayers[domain]) {
        calpuffDomainLayers[domain] = new GraphicsLayer({
          id: 'calpuff-' + domain,
          title: 'CALPUFF ' + domain.toUpperCase(),
        });
        map.add(calpuffDomainLayers[domain]);
      }
    });
  }

  async function loadHRDomainOverlays() {
    try {
      const boundsResponse = await fetch('/js/gis/hr_domain_bounds.json');
      if (!boundsResponse.ok) {
        console.error('Failed to fetch hr_domain_bounds.json');
        return;
      }
      const boundsData = await boundsResponse.json();

      boundsData.forEach(function (domainBounds) {
        const domain = domainBounds.domain;
        const layer = calpuffDomainLayers[domain];
        if (!layer) {
          console.warn('Layer not found for domain:', domain);
          return;
        }

        const corners = domainBounds.corners;
        if (corners.length !== 4) {
          console.warn('Invalid corners for domain bounds:', domain);
          return;
        }

        const rings = [
          [corners[0].lon, corners[0].lat], // NE
          [corners[1].lon, corners[1].lat], // NW
          [corners[2].lon, corners[2].lat], // SW
          [corners[3].lon, corners[3].lat], // SE
          [corners[0].lon, corners[0].lat], // close
        ];

        const boundsGraphic = new Graphic({
          geometry: {
            type: 'polygon',
            rings: [rings],
          },
          symbol: {
            type: 'simple-fill',
            color: [82, 153, 255, 0.32],
            outline: {
              color: [255, 255, 255, 0.9],
              width: 1,
            },
          },
          attributes: {
            domain: domain,
            type: 'bounds',
          },
        });

        layer.add(boundsGraphic);
      });

      console.log('Domain bounds loaded.');
    } catch (err) {
      console.error('Failed to load domain bounds', err);
    }
  }

  initCalpuffDomainLayers();
  loadHRDomainOverlays();

  const sketch = new Sketch({
    layer: graphicsLayer,
    view: view,
    visibleElements: {
      createTools: {
        point: false,
        circle: false,
        polygon: false,
        polyline: false,
        rectangle: true,
      },
      selectionTools: {
        'lasso-selection': false,
        'rectangle-selection': false,
        'pointer-selection': false /* this has no effect - I don't know the correct name for this tool */,
      },
      undoRedoMenu: false,
    },
    container: document.getElementById('sketchdiv'),
    // graphic will be selected as soon as it is created
  });

  sketch.on('create', function (event) {
    var stroke = {
      color: [255, 255, 255],
      width: 1,
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
    if (event.state === 'complete' && event.tool === 'rectangle') {
      var minLatLong = webMercatorUtils.xyToLngLat(
        event.graphic.geometry.extent.xmin,
        event.graphic.geometry.extent.ymin
      );
      var maxLatLong = webMercatorUtils.xyToLngLat(
        event.graphic.geometry.extent.xmax,
        event.graphic.geometry.extent.ymax
      );
      bottomLeftXGlobal = minLatLong[0];
      bottomLeftYGlobal = minLatLong[1];
      topRightXGlobal = maxLatLong[0];
      topRightYGlobal = maxLatLong[1];
    }
  });

  var coordsWidget = document.createElement('div');
  coordsWidget.id = 'coordsWidget';
  coordsWidget.className = 'esri-widget esri-component';
  coordsWidget.style.padding = '7px 15px 5px';

  view.ui.add(coordsWidget, 'bottom-right');

  var downloadAction = {
    title: 'Download Data',
    id: 'download-action',
    image: 'images/download-icon-256.png',
  };

  var downloadZipAction = {
    title: 'Click Here to Download',
    id: 'download-zip-action',
    image: 'images/download-icon-256.png',
  };

  view.popup.on('trigger-action', function (event) {
    // Execute the measureThis() function if the measure-this action is clicked

    if (event.action.id === 'download-action') {
      view.popup.actions.removeAll(); // to prevent clicking the download again

      view.popup.content = 'Determining files to download, please wait...';

      setTimeout(function () {
        downloadModelData();
      }, 1000);
    }

    if (event.action.id === 'download-zip-action') {
      view.popup.actions.removeAll(); // to prevent clicking the download again

      view.popup.content = 'Downloading...';

      setTimeout(function () {
        downloadZip();
      }, 1000);
    }
  });

  // display the download tooltip containing the results from the selected search
  function downloadDialog(topRightPoint) {
    // close dialog if there's already one up.
    view.popup.close();
    view.popup.clear();

    view.popup.open({
      title: 'Model Data For Area',
      actions: [downloadAction],
      content: 'Click the download icon to download your data',
      location: { latitude: topRightPoint.latitude, longitude: topRightPoint.longitude },
    });
  }

  // download the data from the objects store
  async function downloadModelData() {
    var timezoneOffset = parseInt($('input[name="timezone"]:checked').val());

    var startDate = $('#startDate').datetimepicker('getDate');
    var endDate = $('#endDate').datetimepicker('getDate');

    // ORIGINAL, issue with time zone
    // factor in the timezone
    // startDate.setHours(startDate.getHours() + timezoneOffset);
    // endDate.setHours(endDate.getHours() + timezoneOffset);

    //Force UTC entry for dates to avoid timezone issues
    startDate = new Date(Date.UTC(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
      startDate.getHours() + timezoneOffset,
      startDate.getMinutes()
    ));
    endDate = new Date(Date.UTC(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      endDate.getHours() + timezoneOffset,
      endDate.getMinutes()
    ));

    view.popup.content = 'Preparing download... please wait';

    var zipRequestUrl = '/zip-file/zipSearch';
    var zipCheckUrl = '/zip-file/checkZipFile/';
    zipFileUrl = '/zip-file/zipDownload/';
    var zipData = {
      bottomLeftYGlobal: bottomLeftYGlobal,
      topRightYGlobal: topRightYGlobal,
      bottomLeftXGlobal: bottomLeftXGlobal,
      topRightXGlobal: topRightXGlobal,
      timezoneOffsetHours: timezoneOffset,
      startDateIso: startDate.toISOString(),
      endDateIso: endDate.toISOString(),
    };
    await fetch(zipRequestUrl, {
      method: 'POST',
      responseType: 'arraybuffer',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zipData),
    })
      .then((res) => res.json())
      .then((json) => {
        zipCheckUrl = zipCheckUrl.concat(json.subFolder);
        zipFileUrl = zipFileUrl.concat(json.subFolder);
      });

    checkZipFile(zipCheckUrl);
  }

  function checkZipFile(zipCheckUrl) {
    var prevNum = 0;
    var zipping = false;
    const interval = setInterval(function () {
      fetch(zipCheckUrl)
        .then(function (response) {
          if (response.status === 200) {
            return response.json();
          } else {
            throw new Error('Failed to ping route');
          }
        })
        .then(function (resJson) {
          if (resJson.status === 'Ready') {
            clearInterval(interval);
            view.popup.close();
            view.popup.clear();
            view.popup.open({
              title: 'Model Data For Area',
              actions: [downloadZipAction],
              content: 'Your files are ready, click the link below to download them.',
            });
          } else {
            if (resJson.num <= 6 && (resJson.num >= prevNum || !zipping)) {
              view.popup.content = `Downloading ${resJson.num}/6... please wait`;
            } else if (!zipping) {
              zipping = true;
              view.popup.content = `Downloading ${urlsLength}/6... please wait`;
            } else {
              view.popup.content = `Zipping files... please wait`;
            }
          }
        })
        .catch(function (error) {
          console.log('interval closed error');
          console.error(error);
        });
    }, 3000); // Ping the route every 3 seconds
  }

  async function downloadZip() {
    var zipFilename = 'nr-wrf.zip';
    await fetch(zipFileUrl, {
      method: 'GET',
      responseType: 'arraybuffer',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        view.popup.close();
        view.popup.clear();
        graphicsLayer.removeAll();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.log(err);
        alert('Something went wrong');
      });
  }

  clearResults = function () {
    view.popup.close();
    view.popup.clear();
    graphicsLayer.removeAll();
  };

  // Perform the "Search 1" function.  Given a point (lat/long), draw a square
  // equidistance from the point using the distance provided by distanceFromPoint
  search1 = function () {
    var s1Latitude = $('#s1Latitude').val();
    var s1Longitude = $('#s1Longitude').val();
    var distanceFromPoint = $('#distanceFromPoint').val();
    var s1StartDate = $('#startDate').val();
    var s1EndDate = $('#endDate').val();

    if (!validateDate(s1StartDate)) {
      return;
    }

    if (!validateDate(s1EndDate)) {
      return;
    }

    if (!validateDateSelection(s1StartDate, s1EndDate)) {
      return;
    }

    // if users enter a positive longitude, convert to a negative value for them.
    if (s1Longitude >= 0) {
      s1Longitude = s1Longitude * -1;
    }

    if (isNaN(s1Latitude) || s1Latitude == 0) {
      alert('You must enter a valid latitude in the format ##.######');
      return;
    }
    if (isNaN(s1Longitude) || s1Longitude == 0) {
      alert('You must enter a valid longitude in the format ##.######');
      return;
    }

    if (s1Latitude > 63 || s1Latitude < 45 || s1Longitude < -146 || s1Longitude > -106) {
      alert('You have entered a coordinate outside of the bounds of this application.');
      return;
    }

    distanceFromPoint = distanceFromPoint * 1000; // convert km to meters

    var centerPoint = {
      latitude: s1Latitude,
      longitude: s1Longitude,
    };
    var leftPoint = geodesicUtils.pointFromDistance(
      new Point({ x: centerPoint.longitude, y: centerPoint.latitude }),
      distanceFromPoint,
      270
    );
    var rightPoint = geodesicUtils.pointFromDistance(
      new Point({ x: centerPoint.longitude, y: centerPoint.latitude }),
      distanceFromPoint,
      90
    );

    var topRightPoint = geodesicUtils.pointFromDistance(rightPoint, distanceFromPoint, 0);

    var bottomRightPoint = geodesicUtils.pointFromDistance(rightPoint, distanceFromPoint, 180);
    var topLeftPoint = geodesicUtils.pointFromDistance(leftPoint, distanceFromPoint, 0);
    var bottomLeftPoint = geodesicUtils.pointFromDistance(leftPoint, distanceFromPoint, 180);
    bottomLeftXGlobal = bottomLeftPoint.longitude;
    bottomLeftYGlobal = bottomLeftPoint.latitude;
    topRightXGlobal = topRightPoint.longitude;
    topRightYGlobal = topRightPoint.latitude;

    var polygon = {
      type: 'polygon',
      rings: [
        [topLeftPoint.longitude, topLeftPoint.latitude],
        [topRightPoint.longitude, topRightPoint.latitude],
        [bottomRightPoint.longitude, bottomRightPoint.latitude],
        [bottomLeftPoint.longitude, bottomLeftPoint.latitude],
        [topLeftPoint.longitude, topLeftPoint.latitude],
      ],
    };

    var simpleFillSymbol = {
      type: 'simple-fill',
      color: [227, 139, 79, 0.8], // orange, opacity 80%
      outline: {
        color: [255, 255, 255],
        width: 1,
      },
    };

    var polygonGraphic = new Graphic({
      geometry: polygon,
      symbol: simpleFillSymbol,
    });

    graphicsLayer.removeAll();
    graphicsLayer.add(polygonGraphic);

    view.center = polygonGraphic.geometry.centroid;

    downloadDialog(topRightPoint);
  };

  // Perform the "Search 2" function.  Given two points (bottom left and upper right),
  // draw a rectangle
  search2 = function () {
    var s2Latitude1 = $('#s2Latitude1').val();
    var s2Longitude1 = $('#s2Longitude1').val();
    var s2Latitude2 = $('#s2Latitude2').val();
    var s2Longitude2 = $('#s2Longitude2').val();
    var s2StartDate = $('#startDate').val();
    var s2EndDate = $('#endDate').val();

    // if users enter a positive longitude, convert to a negative value for them.
    if (s2Longitude1 >= 0) {
      s2Longitude1 = s2Longitude1 * -1;
    }

    // if users enter a positive longitude, convert to a negative value for them.
    if (s2Longitude2 >= 0) {
      s2Longitude2 = s2Longitude2 * -1;
    }

    bottomLeftXGlobal = s2Longitude1;
    bottomLeftYGlobal = s2Latitude1;
    topRightXGlobal = s2Longitude2;
    topRightYGlobal = s2Latitude2;

    var s2Point1Offset = geodesicUtils.pointFromDistance(new Point({ x: s2Longitude1, y: s2Latitude1 }), 0, 270);

    s2Point1Offset = geodesicUtils.pointFromDistance(
      new Point({ x: s2Point1Offset.longitude, y: s2Point1Offset.latitude }),
      0,
      180
    );

    var s2Point2Offset = geodesicUtils.pointFromDistance(new Point({ x: s2Longitude2, y: s2Latitude2 }), 0, 0);

    s2Point2Offset = geodesicUtils.pointFromDistance(
      new Point({ x: s2Point2Offset.longitude, y: s2Point2Offset.latitude }),
      0,
      90
    );

    if (!validateDate(s2StartDate)) {
      return;
    }

    if (!validateDate(s2EndDate)) {
      return;
    }

    if (!validateDateSelection(s2StartDate, s2EndDate)) {
      return;
    }

    if (isNaN(s2Latitude1) || s1Latitude == 0) {
      alert('You must enter a valid latitude in the format ##.######');
      return;
    }
    if (isNaN(s2Longitude1) || s1Longitude == 0) {
      alert('You must enter a valid longitude in the format ##.######');
      return;
    }

    if (isNaN(s2Latitude2) || s1Latitude == 0) {
      alert('You must enter a valid latitude in the format ##.######');
      return;
    }
    if (isNaN(s2Longitude2) || s1Longitude == 0) {
      alert('You must enter a valid longitude in the format ##.######');
      return;
    }

    if (
      s2Latitude1 > 63 ||
      s2Latitude1 < 45 ||
      s2Longitude1 < -146 ||
      s2Longitude1 > -106 ||
      s2Latitude2 > 63 ||
      s2Latitude2 < 45 ||
      s2Longitude2 < -146 ||
      s2Longitude2 > -106
    ) {
      alert('You have entered a coordinate outside of the bounds of this application.');
      return;
    }

    var polygon = {
      type: 'polygon',
      rings: [
        [s2Point1Offset.longitude, s2Point1Offset.latitude],
        [s2Point1Offset.longitude, s2Point2Offset.latitude],
        [s2Point2Offset.longitude, s2Point2Offset.latitude],
        [s2Point2Offset.longitude, s2Point1Offset.latitude],
        [s2Point1Offset.longitude, s2Point1Offset.latitude],
      ],
    };

    var simpleFillSymbol = {
      type: 'simple-fill',
      color: [227, 139, 79, 0.8], // orange, opacity 80%
      outline: {
        color: [255, 255, 255],
        width: 1,
      },
    };

    var polygonGraphic = new Graphic({
      geometry: polygon,
      symbol: simpleFillSymbol,
    });

    var maxLongitude = Math.max(s2Longitude1, s2Longitude2);
    var maxLatitude = Math.max(s2Latitude1, s2Latitude2);

    graphicsLayer.removeAll();
    graphicsLayer.add(polygonGraphic);

    view.center = [maxLongitude, maxLatitude];

    downloadDialog({ latitude: maxLatitude, longitude: maxLongitude });
  };

  search3 = function () {
    var s3StartDate = $('#startDate').val();
    var s3EndDate = $('#endDate').val();

    if (!validateDate(s3StartDate)) {
      return;
    }

    if (!validateDate(s3EndDate)) {
      return;
    }

    if (graphicsLayer.graphics.length < 1) {
      alert('Please draw a rectangle to mark your selection');
      return;
    }

    view.center = graphicsLayer.graphics.getItemAt(0).geometry.centroid;

    downloadDialog({ latitude: topRightYGlobal, longitude: topRightXGlobal });
  };

  sketch.on('create', function (event) {
    // clear the screen of any popups or previous graphics
    if (event.state === 'start') {
      view.popup.close();
      view.popup.clear();
      graphicsLayer.removeAll();
    }
  });

  // convex hull of data points to form the boundary on the screen
  const boundaryPolygon = {
    type: 'polygon',
    rings: [
    [-139.5939, 60.0510],
    [-134.4557, 47.1161],
    [-134.0814, 47.1161],
    [-113.8375, 47.8083],
    [-111.1669, 60.6548],
    [-111.1464, 61.0020],
    [-111.1464, 61.0098],
    [-111.8784, 61.0542],
    [-112.6124, 61.0950],
    [-113.3482, 61.1344],
    [-114.0857, 61.1710],
    [-114.8247, 61.2039],
    [-115.5651, 61.2330],
    [-116.3067, 61.2583],
    [-117.0493, 61.2798],
    [-117.7928, 61.2975],
    [-118.5370, 61.3114],
    [-119.2817, 61.3215],
    [-120.0268, 61.3278],
    [-120.7721, 61.3302],
    [-121.4422, 61.3302],
    [-122.1866, 61.3288],
    [-122.9307, 61.3237],
    [-123.6744, 61.3147],
    [-124.4173, 61.3019],
    [-125.1595, 61.2853],
    [-125.9008, 61.2648],
    [-126.6408, 61.2406],
    [-127.3796, 61.2126],
    [-128.1170, 61.1808],
    [-128.8527, 61.1453],
    [-129.5866, 61.1060],
    [-130.3186, 61.0629],
    [-131.0486, 61.0161],
    [-131.7763, 60.9656],
    [-132.5016, 60.9114],
    [-133.2244, 60.8535],
    [-133.9445, 60.7919],
    [-134.6619, 60.7267],
    [-135.3762, 60.6578],
    [-136.0876, 60.5854],
    [-136.7957, 60.5093],
    [-137.5005, 60.4297],
    [-138.2019, 60.3465],
    [-138.8997, 60.2599],
    [-139.5939, 60.1697],
    [-139.5939, 60.0510],
],
  };
  const simpleFillSymbol = {
    type: 'simple-fill',
    color: [227, 139, 79, 0.1], // Orange, opacity 80%
    outline: {
      color: [0, 0, 0],
      width: 1,
    },
  };
  const polygonBoundaryGraphic = new Graphic({
    geometry: boundaryPolygon,
    symbol: simpleFillSymbol,
  });
  map.add(boundaryGraphicsLayer);
  boundaryGraphicsLayer.add(polygonBoundaryGraphic);
});
