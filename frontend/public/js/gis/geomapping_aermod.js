require([
  'esri/config',
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/GraphicsLayer',
  'esri/Graphic',
  'esri/geometry/Point',
  'esri/geometry/support/webMercatorUtils',
  'esri/widgets/CoordinateConversion',
], function (esriConfig, Map, MapView, GraphicsLayer, Graphic, Point, webMercatorUtils, CoordinateConversion) {
  const request = new XMLHttpRequest();
  request.open('GET', '/esriConfig', false);
  request.send(null);
  if (request.status === 200) {
    esriConfig.apiKey = request.responseText;
  }

  const graphicsLayer = new GraphicsLayer();
  const boundaryGraphicsLayer = new GraphicsLayer();
  const labelGraphicsLayer = new GraphicsLayer();

  const map = new Map({
    basemap: 'arcgis-topographic',
    layers: [graphicsLayer, boundaryGraphicsLayer, labelGraphicsLayer],
  });

  const view = new MapView({
    map: map,
    center: [-123.329, 48.407],
    zoom: 10,
    container: 'viewDiv',
  });

  // widget for displaying lat, lon of cursor
  const ccWidget = new CoordinateConversion({
    view: view,
  });

  view.ui.add(ccWidget, 'bottom-right');

  // hide tiles when zoomed out
  // view.watch('zoom', (newZoom) => {
  //   if (newZoom <= 7) {
  //     graphicsLayer.visible = false;
  //     labelGraphicsLayer.visible = false;
  //   } else {
  //     graphicsLayer.visible = true;
  //     labelGraphicsLayer.visible = true;
  //   }
  // });

  // hilighted polygon
  const greenPolygonSymbol = {
    type: 'simple-fill',
    color: [144, 238, 144, 0.5], // Light green with 50% transparency
    outline: {
      color: [0, 128, 0, 1], // Dark green outline
      width: 1,
    },
  };

  // default polygon
  const polygonSymbol = {
    type: 'simple-fill',
    color: [169, 169, 169, 0.1], // Light gray with 10% transparency
    outline: {
      color: [69, 69, 69, 1], // Dark gray outline
      width: 1,
    },
  };

  let selectedPolygon = null;
  let currentlyDrawnPoint = null;
  let currentlyDrawnText = null;

  /**
   * Handles clicks to highlight and unhighlight polygons.
   * Uses an R-tree to speed up finding the correct polygon.
   *
   * Will also be made to fill in lat/lon in the search bar.
   */
  view.on('click', function (event) {
    const clickedPoint = view.toMap({ x: event.x, y: event.y });
    const [lon, lat] = webMercatorUtils.xyToLngLat(clickedPoint.x, clickedPoint.y);

    // fill the search lat/lon filds on click
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lon.toFixed(6);

    const data = {
      latitude: lat,
      longitude: lon,
    };
    fetch('mapping/findClosestPoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then((response) => response.json())
      .then((response) => {
        closestPoint = response;
      })
      .catch((error) => {
        console.error('findClosestPoint Error:', error);
      })
      .finally(() => {
        const matchingPolygon = graphicsLayer.graphics.find(
          (graphic) => graphic.attributes && graphic.attributes.tile_id === closestPoint.tile_id
        );
        if (matchingPolygon) {
          // If another polygon was previously selected, reset its color
          if (selectedPolygon && selectedPolygon !== matchingPolygon) {
            selectedPolygon.symbol = polygonSymbol;
          }

          // Make the newly selected polygon green
          matchingPolygon.symbol = greenPolygonSymbol;
          selectedPolygon = matchingPolygon;

          /** Start code for debugging text */
          const centerPoint = selectedPolygon.attributes.center_point;
          const tileId = selectedPolygon.attributes.tile_id;
          const pointI = closestPoint.i;
          const pointJ = closestPoint.j;
          const tileInfoText = `Tile ${tileId.toString().padStart(4, '0')}, (I, J pair ${pointI}, ${pointJ})`;
          const textSymbol = {
            type: 'text',
            color: 'black',
            haloColor: 'white',
            haloSize: '2px',
            text: tileInfoText,
            xoffset: 3,
            yoffset: 3,
            font: {
              size: 14,
              family: 'sans-serif',
            },
          };
          graphicsLayer.remove(currentlyDrawnText);
          currentlyDrawnText = new Graphic({
            geometry: {
              type: 'point',
              x: centerPoint.x,
              y: centerPoint.y,
            },
            symbol: textSymbol,
          });

          graphicsLayer.add(currentlyDrawnText);
          /** End */
        }
        // draw a red dot on the map
        if (currentlyDrawnPoint != null) {
          view.graphics.remove(currentlyDrawnPoint);
        }

        let point = {
          type: 'point',
          x: lon,
          y: lat,
        };

        currentlyDrawnPoint = new Graphic({
          geometry: point,
          symbol: {
            type: 'simple-marker',
            size: 7,
            color: [255, 0, 0],
            outline: null,
          },
        });
        view.graphics.add(currentlyDrawnPoint);
      });
  });

  /**
   * Polygons draw counter-clockwise, this function organizes the corner points
   * in that order.
   * @param {*} coordinates
   * @returns ordered coordinates
   */
  function orderCoordinates(coordinates) {
    const points = coordinates.map((coord) => ({
      lon: parseFloat(coord[0]),
      lat: parseFloat(coord[1]),
      sum: parseFloat(coord[0]) + parseFloat(coord[1]),
    }));

    points.sort((a, b) => a.sum - b.sum);

    const orderedPoints = [];
    orderedPoints[0] = [points[0].lon.toString(), points[0].lat.toString()];
    if (points[1].lon < points[2].lon) {
      orderedPoints[1] = [points[1].lon.toString(), points[1].lat.toString()];
      orderedPoints[3] = [points[2].lon.toString(), points[2].lat.toString()];
    } else {
      orderedPoints[1] = [points[2].lon.toString(), points[2].lat.toString()];
      orderedPoints[3] = [points[1].lon.toString(), points[1].lat.toString()];
    }
    orderedPoints[2] = [points[3].lon.toString(), points[3].lat.toString()];

    return orderedPoints;
  }

  /**
   * Draws a polygon which when clicked turns green, also has tile id text
   *
   */
  function drawPolygon(coordinates, tile_id) {
    const polygon = {
      type: 'polygon',
      rings: [coordinates],
    };

    // used for drawing the tile id and i,j coordinates
    const centerPoint = calculateCenter(coordinates);

    const polygonGraphic = new Graphic({
      geometry: polygon,
      symbol: polygonSymbol,
      attributes: {
        tile_id: tile_id,
        center_point: centerPoint,
      },
    });

    graphicsLayer.add(polygonGraphic);
  }

  /** Used to find the center of a tile for displaying the tile id */
  function calculateCenter(coordinates) {
    let sumX = 0;
    let sumY = 0;

    coordinates.forEach((coord) => {
      let x = parseFloat(coord[0]);
      let y = parseFloat(coord[1]);
      sumX += x;
      sumY += y;
    });

    return {
      x: sumX / 4,
      y: sumY / 4,
    };
  }

  /**
   * Receives corner points ordered by tile from the backend and
   * draws polygons (tiles) using those corner points.
   *
   */
  fetch('/mapping/getCornerPoints')
    .then((response) => response.json())
    .then((pointsByTile) => {
      // Iterate over tile groups and draw polygons for each group
      Object.values(pointsByTile).forEach((tileGroup) => {
        const tile_id = tileGroup[0].tile_id;
        const coordinates = orderCoordinates(tileGroup.map((point) => [point.lon, point.lat]));
        drawPolygon(coordinates, tile_id);
      });
    })
    .catch((error) => console.error(error));

  /** Search and download section */

  var zipFileUrl;
  var urlsLength;
  var closestPoint;
  var lat;
  var lon;

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

  /**
   * Called when the search button is clicked.
   *
   * @returns
   */
  search = function () {
    var startDate = $('#startDate').val();
    var endDate = $('#endDate').val();
    var latitude = $('#latitude').val();
    var longitude = $('#longitude').val();
    // set globals for downloadModelData
    lat = latitude;
    lon = longitude;

    // if users enter a positive longitude, convert to a negative value for them.
    if (longitude >= 0) {
      longitude = longitude * -1;
    }

    if (isNaN(latitude) || latitude == 0) {
      alert('You must enter a valid latitude in the format ##.######');
      return;
    }
    if (isNaN(longitude) || longitude == 0) {
      alert('You must enter a valid longitude in the format ##.######');
      return;
    }

    if (latitude > 63 || latitude < 45 || longitude < -146 || longitude > -106) {
      alert('You have entered a coordinate outside of the bounds of this application.');
      return;
    }

    if (!validateDate(startDate)) {
      return;
    }

    if (!validateDate(endDate)) {
      return;
    }

    if (!validateDateSelection(startDate, endDate)) {
      return;
    }
    highlightAndSearch(latitude, longitude);
  };

  /**
   * Used when searching to select the correct tile based on lat/lon
   *
   * @param {*} lat
   * @param {*} lon
   */
  function highlightAndSearch(lat, lon) {
    const data = {
      latitude: lat,
      longitude: lon,
    };
    fetch('mapping/findClosestPoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then((response) => response.json())
      .then((response) => {
        closestPoint = response;
      })
      .catch((error) => {
        console.error('findClosestPoint Error:', error);
      })
      .finally(() => {
        const matchingPolygon = graphicsLayer.graphics.find(
          (graphic) => graphic.attributes && graphic.attributes.tile_id === closestPoint.tile_id
        );
        if (matchingPolygon) {
          // If another polygon was previously selected, reset its color
          if (selectedPolygon && selectedPolygon !== matchingPolygon) {
            selectedPolygon.symbol = polygonSymbol;
          }

          // Make the newly selected polygon green
          matchingPolygon.symbol = greenPolygonSymbol;
          selectedPolygon = matchingPolygon;
        }
        downloadDialog(lat, lon);
      });
  }

  // display the download tooltip containing the results from the selected search
  const downloadDialog = async (latitude, longitude) => {
    // close dialog if there's already one up.
    view.popup.close();
    view.popup.clear();

    view.popup.open({
      title: `Model Data For Area \n(I, J pair ${closestPoint.i}, ${closestPoint.j})`,
      actions: [downloadAction],
      content: 'Click the download icon to download your data',
      location: {
        latitude: latitude,
        longitude: longitude,
      },
    });

    // draw a red dot on the map
    if (currentlyDrawnPoint) {
      view.graphics.remove(currentlyDrawnPoint);
    }

    let point = {
      type: 'point',
      x: longitude,
      y: latitude,
    };

    currentlyDrawnPoint = new Graphic({
      geometry: point,
      symbol: {
        type: 'simple-marker',
        size: 7,
        color: [255, 0, 0],
        outline: null,
      },
    });
    view.goTo({
      center: [longitude, latitude],
      target: currentlyDrawnPoint,
      zoom: 8,
    });
    view.graphics.add(currentlyDrawnPoint);
  };

  // download the data from the objects store
  async function downloadModelData() {
    console.log(closestPoint);

    var urls = [];

    var baseUrl = 'https://nrs.objectstore.gov.bc.ca/qfncae/support_files/';

    var timezoneOffset = parseInt($('input[name="timezone"]:checked').val());

    var startDate = $('#startDate').datetimepicker('getDate');
    var endDate = $('#endDate').datetimepicker('getDate');

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

    var tileDownloadInfo = {
      startYear,
      startMonth,
      startDay,
      startHour,
      endYear,
      endMonth,
      endDay,
      endHour,
      timeZone: timezoneOffset,
      latitude: lat,
      longitude: lon,
      closestPoint: closestPoint,
    };

    view.popup.content = 'Preparing download... please wait';

    // add the files required to unzip all the files, and process them
    urls.push(baseUrl + 'start.bat');
    urls.push(baseUrl + 'readme.txt');
    urls.push(baseUrl + 'mmif.inp');
    urlsLength = urls.length;

    var zipRequestUrl = '/zip-file/zipAermod';
    var zipCheckUrl = '/zip-file/checkZipFile/';
    zipFileUrl = '/zip-file/zipDownload/';
    var zipData = {
      tileDownloadInfo: tileDownloadInfo,
      urls: urls,
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
            if (resJson.num <= 3 && (resJson.num >= prevNum || !zipping)) {
              view.popup.content = `Downloading ${resJson.num}/3... please wait`;
            } else if (!zipping) {
              zipping = true;
              view.popup.content = `Downloading ${urlsLength}/3... please wait`;
            } else {
              view.popup.content = `Zipping files... please wait`;
            }
          }
        })
        .catch(function (error) {
          console.log('interval closed error');
          console.error(error);
          view.popup.content = 'An error occurred. Please try again later.';
          clearInterval(interval);
        });
    }, 3000); // Ping the route every 3 seconds
  }

  async function downloadZip() {
    var zipFilename = 'nr-wrf_aermod.zip';
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
  };

  // convex hull of data points to form the boundary on the screen
  const boundaryPolygon = {
    type: 'polygon',
    rings: [
      [-137.674, 46.4292],
      [-137.769, 46.7831],
      [-137.865, 47.1373],
      [-137.963, 47.4916],
      [-138.063, 47.846],
      [-138.164, 48.2007],
      [-138.266, 48.5555],
      [-138.37, 48.9104],
      [-138.476, 49.2655],
      [-138.584, 49.6207],
      [-138.693, 49.976],
      [-138.804, 50.3313],
      [-138.916, 50.6868],
      [-139.031, 51.0422],
      [-139.147, 51.3977],
      [-139.265, 51.7533],
      [-139.386, 52.1088],
      [-139.508, 52.4643],
      [-139.632, 52.8198],
      [-139.759, 53.1753],
      [-139.887, 53.5307],
      [-140.018, 53.886],
      [-140.151, 54.2412],
      [-140.287, 54.5964],
      [-140.424, 54.9514],
      [-140.565, 55.3062],
      [-140.708, 55.6609],
      [-140.853, 56.0154],
      [-141.001, 56.3697],
      [-141.152, 56.7238],
      [-141.306, 57.0776],
      [-141.462, 57.4312],
      [-141.622, 57.7845],
      [-141.785, 58.1375],
      [-141.95, 58.4902],
      [-142.119, 58.8426],
      [-142.292, 59.1946],
      [-142.468, 59.5462],
      [-142.647, 59.8974],
      [-142.83, 60.2482],
      [-143.016, 60.5986],
      [-143.207, 60.9485],
      [-143.402, 61.2979],
      [-143.402, 61.2979],
      [-142.673, 61.3905],
      [-141.94, 61.4794],
      [-141.203, 61.5645],
      [-140.462, 61.646],
      [-139.718, 61.7236],
      [-138.97, 61.7975],
      [-138.219, 61.8675],
      [-137.465, 61.9337],
      [-136.708, 61.996],
      [-135.949, 62.0545],
      [-135.186, 62.109],
      [-134.422, 62.1597],
      [-133.654, 62.2064],
      [-132.885, 62.2491],
      [-132.114, 62.2879],
      [-131.341, 62.3227],
      [-130.567, 62.3535],
      [-129.791, 62.3803],
      [-129.014, 62.403],
      [-128.236, 62.4218],
      [-127.457, 62.4365],
      [-126.677, 62.4472],
      [-125.897, 62.4539],
      [-125.117, 62.4565],
      [-124.337, 62.4551],
      [-123.557, 62.4496],
      [-122.777, 62.4402],
      [-121.998, 62.4266],
      [-121.22, 62.4091],
      [-120.442, 62.3875],
      [-119.666, 62.3619],
      [-118.891, 62.3323],
      [-118.118, 62.2987],
      [-117.346, 62.2612],
      [-116.576, 62.2196],
      [-115.808, 62.1741],
      [-115.043, 62.1246],
      [-114.28, 62.0713],
      [-113.519, 62.014],
      [-112.761, 61.9528],
      [-112.007, 61.8878],
      [-111.255, 61.8189],
      [-110.506, 61.7462],
      [-109.761, 61.6696],
      [-109.019, 61.5893],
      [-108.281, 61.5053],
      [-107.547, 61.4175],
      [-107.547, 61.4175],
      [-107.732, 61.067],
      [-107.914, 60.7159],
      [-108.092, 60.3644],
      [-108.266, 60.0125],
      [-108.437, 59.6602],
      [-108.604, 59.3075],
      [-108.768, 58.9544],
      [-108.929, 58.601],
      [-109.087, 58.2473],
      [-109.242, 57.8933],
      [-109.394, 57.539],
      [-109.543, 57.1844],
      [-109.689, 56.8296],
      [-109.833, 56.4745],
      [-109.973, 56.1193],
      [-110.112, 55.7639],
      [-110.248, 55.4083],
      [-110.381, 55.0525],
      [-110.512, 54.6966],
      [-110.641, 54.3406],
      [-110.768, 53.9845],
      [-110.892, 53.6283],
      [-111.014, 53.2721],
      [-111.134, 52.9158],
      [-111.253, 52.5595],
      [-111.369, 52.2031],
      [-111.483, 51.8468],
      [-111.595, 51.4904],
      [-111.706, 51.1341],
      [-111.815, 50.7779],
      [-111.922, 50.4217],
      [-112.027, 50.0655],
      [-112.131, 49.7095],
      [-112.233, 49.3536],
      [-112.333, 48.9978],
      [-112.432, 48.6421],
      [-112.529, 48.2866],
      [-112.625, 47.9312],
      [-112.72, 47.576],
      [-112.813, 47.221],
      [-112.904, 46.8662],
      [-112.995, 46.5116],
      [-112.995, 46.5116],
      [-113.51, 46.572],
      [-114.027, 46.6298],
      [-114.546, 46.6849],
      [-115.065, 46.7374],
      [-115.586, 46.7872],
      [-116.107, 46.8343],
      [-116.63, 46.8788],
      [-117.153, 46.9206],
      [-117.678, 46.9598],
      [-118.203, 46.9962],
      [-118.729, 47.0299],
      [-119.255, 47.0609],
      [-119.783, 47.0893],
      [-120.311, 47.1148],
      [-120.839, 47.1377],
      [-121.368, 47.1578],
      [-121.898, 47.1753],
      [-122.428, 47.1899],
      [-122.958, 47.2019],
      [-123.488, 47.211],
      [-124.018, 47.2175],
      [-124.549, 47.2212],
      [-125.08, 47.2222],
      [-125.61, 47.2204],
      [-126.141, 47.2158],
      [-126.671, 47.2086],
      [-127.202, 47.1986],
      [-127.732, 47.1858],
      [-128.261, 47.1703],
      [-128.791, 47.1521],
      [-129.319, 47.1311],
      [-129.848, 47.1075],
      [-130.376, 47.081],
      [-130.903, 47.0519],
      [-131.429, 47.0201],
      [-131.955, 46.9855],
      [-132.48, 46.9483],
      [-133.004, 46.9084],
      [-133.527, 46.8658],
      [-134.05, 46.8205],
      [-134.571, 46.7725],
      [-135.091, 46.7219],
      [-135.61, 46.6686],
      [-136.128, 46.6127],
      [-136.644, 46.5542],
      [-137.16, 46.493],
      [-137.674, 46.4292],
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
