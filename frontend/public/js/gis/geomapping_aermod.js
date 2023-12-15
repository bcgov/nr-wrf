require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/GraphicsLayer",
  "esri/Graphic",
  "esri/geometry/Point",
  "esri/geometry/support/webMercatorUtils",
  "esri/widgets/CoordinateConversion",
], function (
  esriConfig,
  Map,
  MapView,
  GraphicsLayer,
  Graphic,
  Point,
  webMercatorUtils,
  CoordinateConversion
) {
  const request = new XMLHttpRequest();
  request.open("GET", "/esriConfig", false);
  request.send(null);
  if (request.status === 200) {
    esriConfig.apiKey = request.responseText;
  }

  const graphicsLayer = new GraphicsLayer();
  const boundaryGraphicsLayer = new GraphicsLayer();
  const labelGraphicsLayer = new GraphicsLayer();

  const map = new Map({
    basemap: "arcgis-topographic",
    layers: [graphicsLayer, boundaryGraphicsLayer, labelGraphicsLayer],
  });

  const view = new MapView({
    map: map,
    center: [-123.329, 48.407],
    zoom: 10,
    container: "viewDiv",
  });

  // widget for displaying lat, lon of cursor
  const ccWidget = new CoordinateConversion({
    view: view,
  });

  view.ui.add(ccWidget, "bottom-right");

  // hide tiles when zoomed out
  view.watch("zoom", (newZoom) => {
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
    type: "simple-fill",
    color: [144, 238, 144, 0.5], // Light green with 50% transparency
    outline: {
      color: [0, 128, 0, 1], // Dark green outline
      width: 1,
    },
  };

  // default polygon
  const polygonSymbol = {
    type: "simple-fill",
    color: [169, 169, 169, 0.25], // Light gray with 25% transparency
    outline: {
      color: [69, 69, 69, 1], // Dark gray outline
      width: 1,
    },
  };

  let selectedPolygon = null;

  /**
   * Handles clicks to highlight and unhilight polygons.
   * Uses an R-tree to speed up finding the correct polygon.
   *
   * Will also be made to fill in lat/lon in the search bar.
   */
  view.on("click", function (event) {
    const clickedPoint = view.toMap({ x: event.x, y: event.y });
    const [lon, lat] = webMercatorUtils.xyToLngLat(
      clickedPoint.x,
      clickedPoint.y
    );

    // fill the search lat/lon filds on click
    document.getElementById("latitude").value = lat.toFixed(6);
    document.getElementById("longitude").value = lon.toFixed(6);

    // Create a bounding box around the clicked point for querying the R-tree
    const clickBBox = {
      minX: lon,
      minY: lat,
      maxX: lon,
      maxY: lat,
    };

    const intersectedItems = rtree.search(clickBBox);

    if (intersectedItems.length > 0) {
      const clickedPolygon = intersectedItems[0].polygonGraphic;

      if (clickedPolygon) {
        // If another polygon was previously selected, reset its color
        if (selectedPolygon && selectedPolygon !== clickedPolygon) {
          selectedPolygon.symbol = polygonSymbol;
        }

        // Make the newly selected polygon green
        clickedPolygon.symbol = greenPolygonSymbol;
        selectedPolygon = clickedPolygon;
      }
    }
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

  const rtree = new RBush();

  /**
   * Draws a polygon which when clicked turns green, also has tile id text
   *
   */
  function drawPolygon(coordinates, tile_id) {
    const polygon = {
      type: "polygon",
      rings: [coordinates],
    };

    const polygonGraphic = new Graphic({
      geometry: polygon,
      symbol: polygonSymbol,
      attributes: {
        tile_id: tile_id,
      },
    });

    // const center = getPolygonCenter(coordinates);

    // const textSymbol = {
    //   type: "text",
    //   color: [0, 0, 0, 1], // Black color
    //   text: tile_id.toString().padStart(4, "0"),
    //   font: {
    //     size: "24px",
    //     family: "Arial",
    //     weight: "normal",
    //   },
    //   haloColor: [255, 255, 255, 0.8], // White halo for better visibility
    //   haloSize: 1,
    // };

    // const textGraphic = new Graphic({
    //   geometry: center,
    //   symbol: textSymbol,
    // });

    graphicsLayer.add(polygonGraphic);
    // labelGraphicsLayer.add(textGraphic);

    // Add the polygon to the R-tree
    const bbox = calculateBoundingBox(coordinates);
    const item = { ...bbox, tile_id: tile_id, polygonGraphic };
    rtree.insert(item);
  }

  //   /**
  //  * Used to position the tile_id text on each polygon
  //  *
  //  * @param {*} coordinates
  //  * @returns
  //  */
  //   function getPolygonCenter(coordinates) {
  //     const centroid = coordinates.reduce(
  //       (acc, coord) => {
  //         acc[0] += parseFloat(coord[0]);
  //         acc[1] += parseFloat(coord[1]);
  //         return acc;
  //       },
  //       [0, 0]
  //     );

  //     const centerX = centroid[0] / coordinates.length;
  //     const centerY = centroid[1] / coordinates.length - 0.015;

  //     return new Point({
  //       x: centerX,
  //       y: centerY,
  //       spatialReference: view.spatialReference,
  //     });
  //   }

  /** Function to calculate the bounding box of a polygon
   *
   */
  function calculateBoundingBox(coordinates) {
    const lats = coordinates.map((coord) => coord[1]);
    const lons = coordinates.map((coord) => coord[0]);
    return {
      minX: Math.min(...lons),
      minY: Math.min(...lats),
      maxX: Math.max(...lons),
      maxY: Math.max(...lats),
    };
  }

  /**
   * Reduces the tile_domain_info data to just tile corner points
   *
   * @param {*} tileData
   * @returns
   */
  function filterCornerPoints(tileData) {
    // Convert string properties to appropriate types
    const convertedData = tileData.map((point) => ({
      i: parseInt(point.i, 10),
      j: parseInt(point.j, 10),
      lat: parseFloat(point.lat),
      lon: parseFloat(point.lon),
      tile_id: parseInt(point.tile_id, 10),
    }));

    const pointsByTile = convertedData.reduce((acc, point) => {
      acc[point.tile_id] = acc[point.tile_id] || [];
      acc[point.tile_id].push(point);
      return acc;
    }, {});

    const cornerPoints = Object.values(pointsByTile).flatMap((group) => {
      const minI = Math.min(...group.map((point) => point.i));
      const maxI = Math.max(...group.map((point) => point.i));
      const minJ = Math.min(...group.map((point) => point.j));
      const maxJ = Math.max(...group.map((point) => point.j));

      return group.filter(
        (point) =>
          (point.i === minI && point.j === minJ) ||
          (point.i === minI && point.j === maxJ) ||
          (point.i === maxI && point.j === minJ) ||
          (point.i === maxI && point.j === maxJ)
      );
    });

    return cornerPoints;
  }

  /**
   * Removes deadzones between tiles by shifting tile borders closer
   *
   * @param {*} points
   * @returns
   */
  function updateCornerCoordinates(points) {
    const groupedPoints = {};

    // Iterate over each point and group based on conditions
    points.forEach((point1, index1) => {
      if (point1 !== null) {
        const similarPoints = [point1]; // Array to store points that need averaging

        points.forEach((point2, index2) => {
          if (
            point2 !== null &&
            ((point1.j === point2.j && Math.abs(point1.i - point2.i) === 1) ||
              (point1.i === point2.i && Math.abs(point1.j - point2.j) === 1) ||
              (Math.abs(point1.i - point2.i) === 1 &&
                Math.abs(point1.j - point2.j) === 1))
          ) {
            similarPoints.push(point2);
            // Mark the point to be skipped in the next iterations
            points[index2] = null;
          }
        });

        // Calculate averages
        const avgI =
          similarPoints.reduce((sum, p) => sum + p.i, 0) / similarPoints.length;
        const avgJ =
          similarPoints.reduce((sum, p) => sum + p.j, 0) / similarPoints.length;
        const avgLat =
          similarPoints.reduce((sum, p) => sum + p.lat, 0) /
          similarPoints.length;
        const avgLon =
          similarPoints.reduce((sum, p) => sum + p.lon, 0) /
          similarPoints.length;

        // Update the points with averaged values and their tile_id
        similarPoints.forEach((p) => {
          p.i = avgI;
          p.j = avgJ;
          p.lat = avgLat;
          p.lon = avgLon;
        });

        // Group by the averaged point's tile_id
        const key = `${avgI.toFixed(4)},${avgJ.toFixed(4)},${avgLat.toFixed(
          4
        )},${avgLon.toFixed(4)}`;
        if (!groupedPoints[key]) {
          groupedPoints[key] = [];
        }
        groupedPoints[key].push(...similarPoints);
      }
    });

    // Flatten and format the output
    const flattenedOutput = Object.values(groupedPoints)
      .flat()
      .map((point) => ({
        i: point.i.toFixed(4),
        j: point.j.toFixed(4),
        lon: point.lon.toFixed(4),
        lat: point.lat.toFixed(4),
        tile_id: point.tile_id,
      }));

    return flattenedOutput;
  }

  /**
   * Called when the search button is clicked.
   *
   * @returns
   */
  search = function () {
    var startDate = $("#startDate").val();
    var endDate = $("#endDate").val();
    var latitude = $("#latitude").val();
    var longitude = $("#longitude").val();

    // if users enter a positive longitude, convert to a negative value for them.
    if (longitude >= 0) {
      longitude = longitude * -1;
    }

    if (isNaN(latitude) || latitude == 0) {
      alert("You must enter a valid latitude in the format ##.######");
      return;
    }
    if (isNaN(longitude) || longitude == 0) {
      alert("You must enter a valid longitude in the format ##.######");
      return;
    }

    if (
      latitude > 63 ||
      latitude < 45 ||
      longitude < -146 ||
      longitude > -106
    ) {
      alert(
        "You have entered a coordinate outside of the bounds of this application."
      );
      return;
    }

    if (!validateDate(startDate)) {
      return;
    }

    if (!validateDate(endDate)) {
      return;
    }

    // TODO change this
    downloadDialog(latitude, longitude);
  };

  //
  // DOWNLOAD SECTION START
  //

  // display the download tooltip containing the results from the selected search
  function downloadDialog(latitude, longitude) {
    // close dialog if there's already one up.
    view.popup.close();
    view.popup.clear();

    view.popup.open({
      title: "Model Data For Area",
      actions: [downloadAction],
      content: "Click the download icon to download your data",
      location: {
        latitude: topRightPoint.latitude,
        longitude: topRightPoint.longitude,
      },
    });
  }

  var downloadAction = {
    title: "Download Data",
    id: "download-action",
    image: "images/download-icon-256.png",
  };

  var downloadZipAction = {
    title: "Click Here to Download",
    id: "download-zip-action",
    image: "images/download-icon-256.png",
  };

  view.popup.on("trigger-action", function (event) {
    // Execute the measureThis() function if the measure-this action is clicked

    if (event.action.id === "download-action") {
      view.popup.actions.removeAll(); // to prevent clicking the download again

      view.popup.content = "Determining files to download, please wait...";

      setTimeout(function () {
        downloadModelData();
      }, 1000);
    }

    if (event.action.id === "download-zip-action") {
      view.popup.actions.removeAll(); // to prevent clicking the download again

      view.popup.content = "Downloading...";

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
      title: "Model Data For Area",
      actions: [downloadAction],
      content: "Click the download icon to download your data",
      location: {
        latitude: topRightPoint.latitude,
        longitude: topRightPoint.longitude,
      },
    });
  }

  // download the data from the objects store
  async function downloadModelData() {
    var urls = [];

    var baseUrl = "https://nrs.objectstore.gov.bc.ca/kadkvt/";

    var timezoneOffset = parseInt($('input[name="timezone"]:checked').val());

    var startDate = $("#startDate").datetimepicker("getDate");
    var endDate = $("#endDate").datetimepicker("getDate");

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

    var url2 = "/zip-file/calculateVars";
    var data = {
      bottomLeftYGlobal: bottomLeftYGlobal,
      topRightYGlobal: topRightYGlobal,
      bottomLeftXGlobal: bottomLeftXGlobal,
      topRightXGlobal: topRightXGlobal,
    };
    var c = await fetch(url2, {
      method: "POST",
      responseType: "application/json",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((res) => {
        return res.json();
      })
      .catch(() => {
        alert("Something went wrong");
      });

    var minJ = c.minJ;
    console.log("minJ: " + minJ);

    var maxJ = c.maxJ;
    console.log("maxJ: " + maxJ);

    var minI = c.minI;
    console.log("minI: " + minI);

    var maxI = c.maxI;
    console.log("maxI: " + maxI);

    for (var i = calculateMinimumTileNumber(minI); i <= maxI; i += 10) {
      for (var j = calculateMinimumTileNumber(minJ); j <= maxJ; j += 10) {
        var x1 = String("000" + i).slice(-3); //left pad x1 with zeroes
        var y1 = String("000" + j).slice(-3);
        var x2 = String("000" + (i + 9)).slice(-3);
        var y2 = String("000" + (j + 9)).slice(-3);

        var startingDate = new Date();
        startingDate.setFullYear(startDate.getFullYear());
        startingDate.setMonth(startDate.getMonth());
        startingDate.setDate(1);

        var endingDate = new Date();
        endingDate.setFullYear(endDate.getFullYear());
        endingDate.setMonth(endDate.getMonth());

        for (
          var tileDate = startingDate;
          tileDate <= endingDate;
          tileDate.setMonth(tileDate.getMonth() + 1)
        ) {
          var year = tileDate.getFullYear();
          var month = tileDate.getMonth() + 1;
          month = String("00" + month).slice(-2);
          var fileName =
            "x" +
            x1 +
            "y" +
            y1 +
            "x" +
            x2 +
            "y" +
            y2 +
            "." +
            year +
            "" +
            month +
            ".10x10.m3d.7z";

          urls.push(baseUrl + fileName);
        }
      }
    }

    // generate the m3d_bild_temp.ini file based on user selected parameters
    var stitchingConfig = getConfig(
      baseUrl + "m3d_bild_temp.inp",
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

    view.popup.content = "Preparing download... please wait";

    // add the files required to unzip all the files, and process them
    urls.push(baseUrl + "7z.exe");
    urls.push(baseUrl + "m3d_bild.exe");
    urls.push(baseUrl + "start.bat");
    urls.push(baseUrl + "readme.txt");
    urlsLength = urls.length;

    var zipRequestUrl = "/zip-file/zip";
    var zipCheckUrl = "/zip-file/checkZipFile/";
    zipFileUrl = "/zip-file/zipDownload/";
    var zipData = {
      stitchingConfig: stitchingConfig,
      urls: urls,
    };
    await fetch(zipRequestUrl, {
      method: "POST",
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(zipData),
    })
      .then((res) => res.json())
      .then((json) => {
        zipCheckUrl = zipCheckUrl.concat(json.subFolder);
        zipFileUrl = zipFileUrl.concat(json.subFolder);
      });

    checkZipFile(zipCheckUrl, zipFileUrl);
  }

  function checkZipFile(zipCheckUrl, zipFileUrl) {
    var prevNum = 0;
    var zipping = false;
    const interval = setInterval(function () {
      fetch(zipCheckUrl)
        .then(function (response) {
          if (response.status === 200) {
            return response.json();
          } else {
            throw new Error("Failed to ping route");
          }
        })
        .then(function (resJson) {
          if (resJson.status === "Ready") {
            clearInterval(interval);
            view.popup.close();
            view.popup.clear();
            view.popup.open({
              title: "Model Data For Area",
              actions: [downloadZipAction],
              content:
                "Your files are ready, click the link below to download them.",
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
          console.log("interval closed error");
          console.error(error);
        });
    }, 3000); // Ping the route every 3 seconds
  }

  async function downloadZip() {
    var zipFilename = "nr-wrf.zip";
    await fetch(zipFileUrl, {
      method: "GET",
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        view.popup.close();
        view.popup.clear();
        graphicsLayer.removeAll();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.log(err);
        alert("Something went wrong");
      });
  }

  clearResults = function () {
    view.popup.close();
    view.popup.clear();
    graphicsLayer.removeAll();
  };

  //
  // DOWNLOAD SECTION END
  //

  /**
   * Receives a csv file, alters it to contain only tile corner points,
   * then draws polygons (tiles) using those corner points.
   *
   */
  fetch("/js/gis/tile_domain_info.csv") // change to objectstore
    .then((response) => response.text())
    .then((csvData) => {
      const parsedData = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
      });

      // Remove filename and full_url from each point
      const filteredData = parsedData.data.map((point) => {
        const { filename, full_url, ...filteredPoint } = point;
        return filteredPoint;
      });

      // Reduce the dataset to just tile corner points and get rid of deadzones
      const cornerPoints = updateCornerCoordinates(
        filterCornerPoints(filteredData)
      );

      // Group points by tile_id
      const pointsByTile = cornerPoints.reduce((acc, point) => {
        acc[point.tile_id] = acc[point.tile_id] || [];
        acc[point.tile_id].push(point);
        return acc;
      }, {});

      // Iterate over tile groups and draw polygons for each group
      Object.values(pointsByTile).forEach((tileGroup) => {
        const tile_id = tileGroup[0].tile_id;
        const coordinates = orderCoordinates(
          tileGroup.map((point) => [point.lon, point.lat])
        );
        drawPolygon(coordinates, tile_id);
      });
    })
    .catch((error) => console.error(error));
});
