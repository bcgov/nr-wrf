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

  // O(1) lookup for a tile's Graphic by "domain:tile_id", populated as tiles
  // are drawn. Avoids scanning graphicsLayer.graphics.items (potentially
  // thousands of polygons) on every map click/search.
  const tileGraphicsIndex = {};

  // const domainLayers = {};

  const map = new Map({
    basemap: 'arcgis-topographic',
    layers: [graphicsLayer],
  });

  const view = new MapView({
    map: map,
    // center: [-123.329, 48.407],
    // zoom: 9,
    center: [-122, 50.25],
    zoom: 6,
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
    color: [169, 169, 169, 0.05], // Light gray with 10% transparency
    outline: {
      color: [69, 69, 69, 0.2], // Dark gray outline
      width: 0,
    },
  };

  // high resolution polygon
  const highResPolygonSymbol = {
    type: 'simple-fill',
    color: [112, 143, 230, 0.5], // Light blue with 50% transparency
    outline: {
      width: 0,
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

    // show a loading indicator while we fetch tile data for this location
    view.container.style.cursor = 'progress';

    console.log('findClosestPoint');
    fetch('mapping/findClosestPoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      //   .then((response) => {
      //     if (!response.ok) {
      //       throw new Error(`Failed to calculate AERMOD tiles (status ${response.status})`);
      //     }
      //     return response.json();
      //   })
      //   .then((response) => {
      //     if (!response) {
      //       console.warn('calculateAermodTiles: no tile data for this location (outside the model domain)');
      //       return;
      //     }
      //     console.log('response: ' + JSON.stringify(response));
      //   })
      //   .catch((error) => {
      //     console.error('calculateAermodTiles Error:', error);
      //   });
      // fetch('mapping/findClosestD02Tile', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(data),
      // })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to find closest point (status ${response.status})`);
        }
        // findClosestPoint returns {i, j, tile, domain, url} - or an empty
        // body when the location is outside every model domain (null).
        return response.text();
      })
      .then((text) => {
        const point = text ? JSON.parse(text) : null;
        if (!point || !point.domain) {
          console.warn('findClosestPoint: no tile data for this location (outside the model domain)');
          closestPoint = null;
          return;
        }
        closestPoint = point;
      })
      .catch((error) => {
        console.error('findClosestPoint Error:', error);
        closestPoint = null;
      })
      .finally(() => {
        // done loading - restore the normal cursor
        view.container.style.cursor = 'default';

        // reset previous selected polygon
        if (selectedPolygon) {
          if (
            selectedPolygon.attributes &&
            selectedPolygon.attributes.domain &&
            selectedPolygon.attributes.domain !== 'd02'
          ) {
            selectedPolygon.symbol = highResPolygonSymbol;
          } else {
            selectedPolygon.symbol = polygonSymbol;
          }
          selectedPolygon = null;
        }
        if (currentlyDrawnPoint != null) {
          view.graphics.remove(currentlyDrawnPoint);
        }
        if (currentlyDrawnText) {
          graphicsLayer.remove(currentlyDrawnText);
        }
        //console.log('The closestPoint is: ' + JSON.stringify(closestPoint));
        if (!closestPoint || closestPoint === null) {
          alert('You have entered a coordinate outside of the bounds of this application.');
          return;
        }
        if (closestPoint.domain === 'd02') {
          // // find and highlight the new polygon
          // const found = graphicsLayer.graphics.items.find(
          //   (gr) => gr.attributes && gr.attributes.tile_id === closestPoint.tile
          // );
          // if (found) {
          //   selectedPolygon = found;
          //   found.symbol = greenPolygonSymbol;

          //   // add tile info text
          //   const centerPoint = calculateCenter(found.geometry.rings[0]);

          //   // const tileInfoText = `Tile ${tileId.toString().padStart(4, '0')}, (I, J pair ${pointI}, ${pointJ})`;
          //   const textSymbol = {
          //     type: 'text',
          //     color: 'black',
          //     haloColor: 'white',
          //     haloSize: '2px',
          //     text: closestPoint.tile.toString().padStart(4, '0'),
          //     xoffset: 3,
          //     yoffset: 3,
          //     font: {
          //       size: 14,
          //       family: 'sans-serif',
          //     },
          //   };
          //   currentlyDrawnText = new Graphic({
          //     geometry: {
          //       type: 'point',
          //       x: centerPoint.x,
          //       y: centerPoint.y,
          //     },
          //     symbol: textSymbol,
          //   });
          //   graphicsLayer.add(currentlyDrawnText);
          // }

          // draw a red dot on the map

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
        } else {
          console.log('in else, trying to draw hr tile highlight');
          // find and highlight the new polygon
          const found = tileGraphicsIndex[`${closestPoint.domain}:${closestPoint.tile}`];
          if (found) {
            // selectedPolygon = found;
            // found.symbol = greenPolygonSymbol;
            // // add tile info text
            // const centerPoint = calculateCenter(found.geometry.rings[0]);
            // // const tileInfoText = `Tile ${tileId.toString().padStart(4, '0')}, (I, J pair ${pointI}, ${pointJ})`;
            // const textSymbol = {
            //   type: 'text',
            //   color: 'black',
            //   haloColor: 'white',
            //   haloSize: '2px',
            //   text: closestPoint.tile.toString().padStart(4, '0'),
            //   xoffset: 3,
            //   yoffset: 3,
            //   font: {
            //     size: 14,
            //     family: 'sans-serif',
            //   },
            // };
            // currentlyDrawnText = new Graphic({
            //   geometry: {
            //     type: 'point',
            //     x: centerPoint.x,
            //     y: centerPoint.y,
            //   },
            //   symbol: textSymbol,
            // });
            // graphicsLayer.add(currentlyDrawnText);
          }

          // draw a red dot on the map
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
        }
      });
  });

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

  function drawHRTiles() {
    fetch('/js/gis/aermod_tiles_hr.json')
      .then((response) => response.json())
      .then((tiles) => {
        const graphics = [];

        tiles.forEach((tile) => {
          // Create polygon from four corners: NE -> NW -> SW -> SE
          const coordinates = tile.extended_corners.map((corner) => [corner.lon, corner.lat]);

          const polygon = {
            type: 'polygon',
            rings: [coordinates],
          };

          const g = new Graphic({
            geometry: polygon,
            symbol: highResPolygonSymbol,
            attributes: { tile_id: tile.tileId.toString(), domain: tile.domain },
          });

          graphics.push(g);
          tileGraphicsIndex[`${tile.domain}:${tile.tileId}`] = g;

          // Add tile number label
          // const centerPoint = calculateCenter(coordinates);
          // const textSymbol = {
          //   type: 'text',
          //   color: 'blue',
          //   haloColor: 'white',
          //   haloSize: '2px',
          //   // text: tile.tileId.toString().padStart(4, '0'),
          //   xoffset: 0,
          //   yoffset: 0,
          //   font: {
          //     size: 10,
          //     family: 'sans-serif',
          //   },
          // };

          // const textGraphic = new Graphic({
          //   geometry: {
          //     type: 'point',
          //     x: centerPoint.x,
          //     y: centerPoint.y,
          //   },
          //   symbol: textSymbol,
          // });

          // graphicsLayer.add(textGraphic);
        });

        graphicsLayer.addMany(graphics);
        console.log(`Loaded ${tiles.length} HR tiles from aermod_tiles_hr.json`);
      })
      .catch((error) => console.error('Error loading HR tiles:', error));
  }

  // graphics layer tiles
  function drawTiles() {
    fetch('/mapping/getAermodTiles')
      .then((response) => response.json())
      .then((tiles) => {
        const graphics = [];

        tiles.forEach((tile) => {
          // Create polygon from four corners: NE -> NW -> SW -> SE
          const coordinates = tile.extended_corners.map((corner) => [corner.lon, corner.lat]);

          const polygon = {
            type: 'polygon',
            rings: [coordinates],
          };

          const g = new Graphic({
            geometry: polygon,
            symbol: polygonSymbol,
            attributes: { tile_id: tile.tileId, domain: 'd02' },
          });

          graphics.push(g);
          tileGraphicsIndex[`d02:${tile.tileId}`] = g;

          // Add tile number label
          // const centerPoint = calculateCenter(coordinates);
          // const textSymbol = {
          //   type: 'text',
          //   color: 'black',
          //   haloColor: 'white',
          //   haloSize: '2px',
          //   text: tile.tileId.toString().padStart(4, '0'),
          //   xoffset: 0,
          //   yoffset: 0,
          //   font: {
          //     size: 11,
          //     family: 'sans-serif',
          //   },
          // };

          // const textGraphic = new Graphic({
          //   geometry: {
          //     type: 'point',
          //     x: centerPoint.x,
          //     y: centerPoint.y,
          //   },
          //   symbol: textSymbol,
          // });

          // graphicsLayer.add(textGraphic);
        });

        graphicsLayer.addMany(graphics);
        console.log(`Loaded ${tiles.length} debug tiles from AERMOD service`);
      })
      .catch((error) => console.error('Error loading debug tiles:', error));
  }

  // function initDomainLayers() {
  //   const domains = ['d03', 'd04', 'd05', 'd06'];
  //   console.log('initDomainLayers');
  //   domains.forEach(function (domain) {
  //     if (!domainLayers[domain]) {
  //       domainLayers[domain] = new GraphicsLayer({
  //         id: 'aermod-' + domain,
  //         title: 'AERMOD ' + domain.toUpperCase(),
  //       });
  //       map.add(domainLayers[domain]);
  //     }
  //   });
  // }

  // async function loadHRDomainOverlays() {
  //   try {
  //     const boundsResponse = await fetch('/js/gis/hr_domain_bounds.json');
  //     if (!boundsResponse.ok) {
  //       console.error('Failed to fetch hr_domain_bounds.json');
  //       return;
  //     }
  //     const boundsData = await boundsResponse.json();

  //     boundsData.forEach(function (domainBounds) {
  //       const domain = domainBounds.domain;
  //       const layer = domainLayers[domain];
  //       if (!layer) {
  //         console.warn('Layer not found for domain:', domain);
  //         return;
  //       }

  //       const corners = domainBounds.corners;
  //       if (corners.length !== 4) {
  //         console.warn('Invalid corners for domain bounds:', domain);
  //         return;
  //       }

  //       const rings = [
  //         [corners[0].lon, corners[0].lat], // NE
  //         [corners[1].lon, corners[1].lat], // NW
  //         [corners[2].lon, corners[2].lat], // SW
  //         [corners[3].lon, corners[3].lat], // SE
  //         [corners[0].lon, corners[0].lat], // close
  //       ];

  //       const boundsGraphic = new Graphic({
  //         geometry: {
  //           type: 'polygon',
  //           rings: [rings],
  //         },
  //         symbol: {
  //           type: 'simple-fill',
  //           color: [82, 153, 255, 0.32],
  //           outline: {
  //             color: [255, 255, 255, 0.9],
  //             width: 1,
  //           },
  //         },
  //         attributes: {
  //           domain: domain,
  //           type: 'bounds',
  //         },
  //       });

  //       layer.add(boundsGraphic);
  //     });

  //     console.log('Domain bounds loaded.');
  //   } catch (err) {
  //     console.error('Failed to load domain bounds', err);
  //   }
  // }

  // async function loadHRDomainTiles() {
  //   try {
  //     const tilesResponse = await fetch('/js/gis/hr_domain_tiles.json');
  //     if (!boundsResponse.ok) {
  //       console.error('Failed to fetch hr_domain_tiles.json');
  //       return;
  //     }
  //     const tilesData = await tilesResponse.json();

  //     tilesData.forEach(function (domainBounds) {});

  //     console.log('Domain tiles loaded.');
  //   } catch (err) {
  //     console.error('Failed to load domain tiles', err);
  //   }
  // }

  /**
   * Loads corner points from the CSV file and draws polygons (tiles) on the map.
   * The CSV has all 4 corners pre-computed and aligned to remove gaps.
   */
  drawTiles();
  // initDomainLayers();
  // loadHRDomainOverlays();
  drawHRTiles();

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

    // Guard: skip fetching tile data for locations outside the d02 domain
    if (!closestPoint) {
      alert('You have entered a coordinate outside of the bounds of this application.');
      return;
    }

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
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`status ${response.status}`))))
      .then((text) => {
        // An empty body means findClosestPoint returned null (outside all domains)
        closestPoint = text ? JSON.parse(text) : null;
      })
      .catch((error) => {
        console.error('findClosestPoint Error:', error);
        // Don't let a stale point from a previous search slip through
        closestPoint = null;
      })
      .finally(() => {
        // reset previous selected polygon
        if (selectedPolygon) {
          selectedPolygon.symbol = polygonSymbol;
          selectedPolygon = null;
        }

        // The searched coordinate is outside every model domain (including
        // the coarse d02 domain) - inform the user and stop.
        if (!closestPoint || !closestPoint.domain) {
          alert('You have entered a coordinate outside of the bounds of this application.');
          return;
        }

        // find and highlight the new polygon
        const found = tileGraphicsIndex[`${closestPoint.domain}:${closestPoint.tile}`];
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
      title: `Model Data For Tile ${closestPoint.tile}`,
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

  async function downloadModelData() {
    if (!closestPoint || !closestPoint.domain) {
      alert('The selected location is outside the model domain. Please choose a location within the highlighted area.');
      return;
    }
    console.info('Download Model Data: ' + JSON.stringify(closestPoint));
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
      domain: closestPoint.domain,
    };
    let requestFailed = false;
    await fetch(zipRequestUrl, {
      method: 'POST',
      responseType: 'arraybuffer',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zipData),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to start download (status ${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        zipCheckUrl = zipCheckUrl.concat(json.subFolder);
        zipFileUrl = zipFileUrl.concat(json.subFolder);
      })
      .catch((error) => {
        console.error('downloadModelData Error:', error);
        view.popup.content = 'An error occurred while preparing your download. Please try again later.';
        requestFailed = true;
      });

    if (requestFailed) {
      return;
    }

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
              view.popup.content = `Downloading ${resJson?.num || '3'}/3... please wait`;
            } else if (!zipping) {
              zipping = true;
              view.popup.content = `Downloading 3/3... please wait`;
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
