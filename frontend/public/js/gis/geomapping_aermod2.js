require([
  'esri/config',
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/GraphicsLayer',
  'esri/layers/FeatureLayer',
  'esri/Graphic',
  'esri/geometry/Point',
  'esri/geometry/support/webMercatorUtils',
  'esri/widgets/CoordinateConversion',
], function (
  esriConfig,
  Map,
  MapView,
  GraphicsLayer,
  FeatureLayer,
  Graphic,
  Point,
  webMercatorUtils,
  CoordinateConversion
) {
  const request = new XMLHttpRequest();
  request.open('GET', '/esriConfig', false);
  request.send(null);
  if (request.status === 200) {
    esriConfig.apiKey = request.responseText;
  }

  const graphicsLayer = new GraphicsLayer();
  const boundaryGraphicsLayer = new GraphicsLayer();
  const labelGraphicsLayer = new GraphicsLayer();
  const debugGraphicsLayer = new GraphicsLayer();

  const map = new Map({
    basemap: 'arcgis-topographic',
    layers: [debugGraphicsLayer, graphicsLayer, boundaryGraphicsLayer, labelGraphicsLayer],
  });

  const view = new MapView({
    map: map,
    // center: [-123.329, 48.407],
    // zoom: 9,
    center: [-122, 50.25],
    zoom: 7,
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

  // debug polygon (original tiles from aermod_files.csv)
  const debugPolygonSymbol = {
    type: 'simple-fill',
    color: [173, 216, 230, 0.3], // Light blue with 30% transparency
    outline: {
      color: [0, 0, 255, 0.5], // Blue outline
      width: 1,
    },
  };

  let selectedPolygon = null;
  let currentlyDrawnPoint = null;
  let currentlyDrawnText = null;
  let featureLayer = null;
  let layerViewRef = null;
  let selectedHighlight = null;

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
        // reset previous selected polygon
        if (selectedPolygon) {
          selectedPolygon.symbol = polygonSymbol;
          selectedPolygon = null;
        }

        // find and highlight the new polygon
        const found = graphicsLayer.graphics.items.find(
          (gr) => gr.attributes && gr.attributes.tile_id === closestPoint.tile
        );
        if (found) {
          selectedPolygon = found;
          found.symbol = greenPolygonSymbol;

          // add tile info text
          const centerPoint = calculateCenter(found.geometry.rings[0]);
          const tileId = closestPoint.tile;
          const pointI = closestPoint.i;
          const pointJ = closestPoint.j;
          // const tileInfoText = `Tile ${tileId.toString().padStart(4, '0')}, (I, J pair ${pointI}, ${pointJ})`;
          const textSymbol = {
            type: 'text',
            color: 'black',
            haloColor: 'white',
            haloSize: '2px',
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

    // Add tile number label
    const textSymbol = {
      type: 'text',
      color: 'black',
      haloColor: 'white',
      haloSize: '2px',
      text: tile_id.toString().padStart(4, '0'),
      xoffset: 0,
      yoffset: 0,
      font: {
        size: 10,
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

    labelGraphicsLayer.add(textGraphic);
  }

  /** Used to find the center of a tile for displaying the tile id */
  function calculateCenter(coordinates) {
    let sumX = 0;
    let sumY = 0;

    // If the ring is closed (first point repeated at end), ignore the last point
    let count = coordinates.length;
    if (count > 1) {
      const firstX = parseFloat(coordinates[0][0]);
      const firstY = parseFloat(coordinates[0][1]);
      const lastX = parseFloat(coordinates[count - 1][0]);
      const lastY = parseFloat(coordinates[count - 1][1]);
      if (firstX === lastX && firstY === lastY) {
        count = count - 1;
      }
    }

    for (let i = 0; i < count; i++) {
      const coord = coordinates[i];
      const x = parseFloat(coord[0]);
      const y = parseFloat(coord[1]);
      sumX += x;
      sumY += y;
    }

    return {
      x: sumX / count,
      y: sumY / count,
    };
  }

  /**
   * Parse the aermod_corner_points.csv and return an array of tile objects
   */
  function parseCornerPointsCsv(csvContent) {
    const lines = csvContent.split('\n');
    const tiles = [];

    // Skip header row (line 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',');
      if (cols.length < 16) continue;

      // CSV format:
      // filename,tile,domain,year,I0,J0,I1,J1,lat_sw,lon_sw,lat_se,lon_se,lat_nw,lon_nw,lat_ne,lon_ne,url
      const tile = {
        tileId: parseInt(cols[1]),
        lat_sw: parseFloat(cols[8]),
        lon_sw: parseFloat(cols[9]),
        lat_se: parseFloat(cols[10]),
        lon_se: parseFloat(cols[11]),
        lat_nw: parseFloat(cols[12]),
        lon_nw: parseFloat(cols[13]),
        lat_ne: parseFloat(cols[14]),
        lon_ne: parseFloat(cols[15]),
      };

      tiles.push(tile);
    }

    return tiles;
  }

  /**
   * Parse the aermod_files.csv and return an array of tile objects for debug
   */
  function parseOriginalTilesCsv(csvContent) {
    const lines = csvContent.split('\n');
    const tiles = [];
    const seen = new Set();

    // Skip header row (line 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',');
      if (cols.length < 12) continue;

      // Only include d02 domain
      if (cols[2] !== 'd02') continue;

      // Deduplicate by tile ID
      const tileId = parseInt(cols[1]);
      if (seen.has(tileId)) continue;
      seen.add(tileId);

      // CSV format:
      // filename,tile,domain,year,I0,J0,I1,J1,lat0,lon0,lat1,lon1,url
      // lat0/lon0 = NE corner, lat1/lon1 = SW corner
      const tile = {
        tileId: tileId,
        lat0: parseFloat(cols[8]), // north
        lon0: parseFloat(cols[9]), // east
        lat1: parseFloat(cols[10]), // south
        lon1: parseFloat(cols[11]), // west
      };

      tiles.push(tile);
    }

    return tiles;
  }

  /**
   * Debug function: Draws original tiles from aermod_files.csv as light blue polygons.
   * These are non-interactable and show the original tile boundaries before averaging.
   */
  // function drawDebugTiles() {
  //   fetch('/mapping/getAermodTiles')
  //     .then((response) => response.json())
  //     .then((tiles) => {
  //       tiles.forEach((tile) => {
  //         if (tile.tileId === 1500) {
  //           console.log('debug (new)');
  //           console.log(tile);
  //         }
  //         // Create polygon from four corners: NE -> NW -> SW -> SE
  //         const coordinates = tile.corners.map((corner) => [corner.lon, corner.lat]);

  //         const polygon = {
  //           type: 'polygon',
  //           rings: [coordinates],
  //         };

  //         const debugGraphic = new Graphic({
  //           geometry: polygon,
  //           symbol: debugPolygonSymbol,
  //           attributes: { isDebug: true },
  //         });

  //         debugGraphicsLayer.add(debugGraphic);

  //         // Add tile number label
  //         const centerPoint = calculateCenter(coordinates);
  //         const textSymbol = {
  //           type: 'text',
  //           color: 'blue',
  //           haloColor: 'white',
  //           haloSize: '2px',
  //           text: tile.tileId.toString().padStart(4, '0'),
  //           xoffset: 0,
  //           yoffset: 0,
  //           font: {
  //             size: 10,
  //             family: 'sans-serif',
  //           },
  //         };

  //         const textGraphic = new Graphic({
  //           geometry: {
  //             type: 'point',
  //             x: centerPoint.x,
  //             y: centerPoint.y,
  //           },
  //           symbol: textSymbol,
  //         });

  //         debugGraphicsLayer.add(textGraphic);
  //       });

  //       console.log(`Loaded ${tiles.length} debug tiles from AERMOD service`);
  //     })
  //     .catch((error) => console.error('Error loading debug tiles:', error));
  // }

  // graphics layer tiles
  function drawTiles() {
    fetch('/mapping/getAermodTiles')
      .then((response) => response.json())
      .then((tiles) => {
        tiles.forEach((tile) => {
          if (tile.tileId === 1500 || tile.tileId === 2427 || tile.tileId === 3500) {
            console.log('debug (new)');
            console.log(tile);
          }
          // Create polygon from four corners: NE -> NW -> SW -> SE
          const coordinates = tile.extended_corners.map((corner) => [corner.lon, corner.lat]);

          const polygon = {
            type: 'polygon',
            rings: [coordinates],
          };

          const g = new Graphic({
            geometry: polygon,
            symbol: polygonSymbol,
            attributes: { tile_id: tile.tileId },
          });

          graphicsLayer.add(g);

          // Add tile number label
          const centerPoint = calculateCenter(coordinates);
          const textSymbol = {
            type: 'text',
            color: 'black',
            haloColor: 'white',
            haloSize: '2px',
            text: tile.tileId.toString().padStart(4, '0'),
            xoffset: 0,
            yoffset: 0,
            font: {
              size: 11,
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
        });

        console.log(`Loaded ${tiles.length} debug tiles from AERMOD service`);
      })
      .catch((error) => console.error('Error loading debug tiles:', error));
  }

  // feature layer tiles
  function drawDebugTiles() {
    fetch('/mapping/getAermodTilesSimplified')
      .then((response) => response.json())
      .then((tiles) => {
        const features = [];
        tiles.forEach((tile) => {
          if (tile.tileId === 1500 || tile.tileId === 2427 || tile.tileId === 3500) {
            console.log('debug (new)');
            console.log(tile);
          }
          // Create polygon from four corners: NE -> NW -> SW -> SE
          const coordinates = tile.extended_corners.map((corner) => [corner.lon, corner.lat]);

          // Ensure coordinates are ordered counter-clockwise and the ring is closed
          const ordered = orderCoordinates(coordinates);
          if (ordered.length > 0) {
            const first = ordered[0];
            const last = ordered[ordered.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              ordered.push([first[0], first[1]]);
            }
          }

          const polygon = {
            type: 'polygon',
            rings: [ordered],
          };

          const centerPoint = calculateCenter(ordered);

          // Build a lightweight feature object (avoid creating Graphic instances for memory savings)
          const feat = {
            geometry: {
              type: 'polygon',
              rings: [ordered],
              spatialReference: { wkid: 4326 },
            },
            attributes: {
              tile_id: tile.tileId,
              center_x: centerPoint.x,
              center_y: centerPoint.y,
            },
          };

          features.push(feat);
        });

        // Create a client-side FeatureLayer from the features array. This is much faster
        // for rendering large numbers of features compared to adding many Graphics to a GraphicsLayer.
        featureLayer = new FeatureLayer({
          source: features,
          objectIdField: 'tile_id',
          fields: [
            { name: 'tile_id', alias: 'Tile ID', type: 'integer' },
            { name: 'center_x', alias: 'Center X', type: 'double' },
            { name: 'center_y', alias: 'Center Y', type: 'double' },
          ],
          geometryType: 'polygon',
          renderer: {
            type: 'simple',
            symbol: polygonSymbol,
          },
          // No labelingInfo: we'll add explicit label Graphics at averaged centers
          outFields: ['tile_id', 'center_x', 'center_y'],
        });

        map.add(featureLayer);

        // Add labels as separate point Graphics at the averaged centers (convert to WebMercator)
        try {
          features.forEach((f) => {
            const cx = f.attributes.center_x;
            const cy = f.attributes.center_y;
            const ptGeo = {
              type: 'point',
              x: cx,
              y: cy,
              spatialReference: { wkid: 4326 },
            };
            const ptWeb = webMercatorUtils.geographicToWebMercator(ptGeo);
            const textSymbol = {
              type: 'text',
              color: 'black',
              haloColor: 'white',
              haloSize: '2px',
              text: f.attributes.tile_id.toString().padStart(4, '0'),
              xoffset: 0,
              yoffset: 0,
              font: { size: 10, family: 'sans-serif' },
            };
            const textGraphic = new Graphic({
              geometry: ptWeb,
              symbol: textSymbol,
            });
            labelGraphicsLayer.add(textGraphic);
          });
        } catch (e) {
          console.error('adding label graphics error', e);
        }

        view.whenLayerView(featureLayer).then((lv) => {
          layerViewRef = lv;
        });

        console.log(`Loaded ${tiles.length} debug tiles from AERMOD service`);
      })
      .catch((error) => console.error('Error loading debug tiles:', error));
  }

  /**
   * Loads corner points from the CSV file and draws polygons (tiles) on the map.
   * The CSV has all 4 corners pre-computed and aligned to remove gaps.
   */
  drawTiles();
  // drawDebugTiles();

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
        // reset previous selected polygon
        if (selectedPolygon) {
          selectedPolygon.symbol = polygonSymbol;
          selectedPolygon = null;
        }

        // find and highlight the new polygon
        const found = graphicsLayer.graphics.items.find(
          (gr) => gr.attributes && gr.attributes.tile_id === closestPoint.tile
        );
        if (found) {
          selectedPolygon = found;
          found.symbol = greenPolygonSymbol;
        }

        if (!featureLayer || !layerViewRef) {
          downloadDialog(lat, lon);
          return;
        }
        featureLayer
          .queryFeatures({ where: `tile_id = ${closestPoint.tile}`, outFields: ['tile_id', 'center_x', 'center_y'] })
          .then((result) => {
            if (result.features && result.features.length > 0) {
              if (selectedHighlight) {
                try {
                  selectedHighlight.remove();
                } catch (e) {}
                selectedHighlight = null;
              }
              selectedHighlight = layerViewRef.highlight(result.features);
            }
          })
          .catch((err) => console.error('queryFeatures error:', err))
          .finally(() => downloadDialog(lat, lon));
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
    });
    view.graphics.add(currentlyDrawnPoint);
  };

  // download the data from the objects store
  // TODO move this to backend
  async function downloadModelData() {
    var timezoneOffset = parseInt($('input[name="timezone"]:checked').val());

    var startDate = $('#startDate').datetimepicker('getDate');
    var endDate = $('#endDate').datetimepicker('getDate');

    view.popup.content = 'Preparing download... please wait';

    var zipRequestUrl = '/zip-file/zipAermodFromCoords';
    var zipCheckUrl = '/zip-file/checkZipFile/';
    zipFileUrl = '/zip-file/zipDownload/';
    var zipData = {
      latitude: lat,
      longitude: lon,
      startDateIso: startDate.toISOString(),
      endDateIso: endDate.toISOString(),
      timezoneOffsetHours: timezoneOffset,
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
