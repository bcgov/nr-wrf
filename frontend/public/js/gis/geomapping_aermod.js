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
  view.watch('zoom', (newZoom) => {
    if (newZoom <= 7) {
      graphicsLayer.visible = false;
      labelGraphicsLayer.visible = false;
    } else {
      graphicsLayer.visible = true;
      labelGraphicsLayer.visible = true;
    }
  });

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

    const polygonGraphic = new Graphic({
      geometry: polygon,
      symbol: polygonSymbol,
      attributes: {
        tile_id: tile_id,
      },
    });

    graphicsLayer.add(polygonGraphic);

    /** Start code for displaying tile id on tile */
    const centerPoint = calculateCenter(coordinates);
    const textSymbol = {
      type: 'text',
      color: 'black',
      haloColor: 'white',
      haloSize: '2px',
      text: tile_id,
      xoffset: 3,
      yoffset: 3,
      font: {
        size: 14,
        family: 'sans-serif',
      },
    };

    const textGraphic = new Graphic({
      geometry: {
        type: 'point',
        x: centerPoint.x,
        y: centerPoint.y,
      },
      symbol: textSymbol,
    });

    graphicsLayer.add(textGraphic);
    /** End */
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
});
