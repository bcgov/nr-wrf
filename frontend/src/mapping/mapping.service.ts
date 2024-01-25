import { Injectable } from "@nestjs/common";
import {
  filterCornerPoints,
  getXLatMArray,
  getXLongMArray,
  updateCornerCoordinates,
} from "util/util";
const fs = require("fs");
import * as Papa from "papaparse";

@Injectable()
export class MappingService {
  private tileDomainInfo: string;

  onModuleInit() {
    try {
      this.tileDomainInfo = fs.readFileSync(
        "dist/public/js/gis/tile_domain_info.csv",
        "utf-8"
      );
      console.log("Tile domain info loaded into memory.");
    } catch (error) {
      console.log("Error loading tile domain info into memory:");
      console.log(error);
    }
  }
  async findClosestPoint(
    desiredLatitude: number,
    desiredLongitude: number
  ): Promise<any> {
    try {
      const rawData = Papa.parse(this.tileDomainInfo, {
        header: true,
        skipEmptyLines: true,
      });

      const parsedData = rawData.data.map((entry) => ({
        i: parseInt(entry.i),
        j: parseInt(entry.j),
        lat: parseFloat(entry.lat),
        lon: parseFloat(entry.lon),
        tile_id: parseInt(entry.tile_id),
        filename: entry.filename,
        full_url: entry.full_url,
      }));

      let xlatMArray = getXLatMArray(parsedData);
      let xlongMArray = getXLongMArray(parsedData);
      let a = xlatMArray.length;
      let array = [];
      for (let i = 0; i < a; i++) {
        array[i] = [];
        for (let j = 0; j < a; j++) {
          array[i][j] = null;
        }
      }
      for (let i = 0; i < a; i++) {
        for (let j = 0; j < a; j++) {
          if (xlatMArray[i][j] && xlongMArray[i][j]) {
            let latitudeDiff = desiredLatitude - xlatMArray[i][j];
            let longitudeDiff = desiredLongitude - xlongMArray[i][j];
            array[i][j] =
              Math.pow(latitudeDiff, 2) + Math.pow(longitudeDiff, 2);
          }
        }
      }
      let min = 999;
      let max = -999;
      let minIndex = [0, 0];
      let maxIndex = [0, 0];
      for (let i = 0; i < array.length; i++) {
        for (let j = 0; j < array.length; j++) {
          if (array[i][j] && array[i][j] < min) {
            min = array[i][j];
            minIndex[0] = i;
            minIndex[1] = j;
          }
          if (array[i][j] && array[i][j] > max) {
            max = array[i][j];
            maxIndex[0] = i;
            maxIndex[1] = j;
          }
        }
      }
      const closestPoint = parsedData.find(
        (point) => point.i === minIndex[0] && point.j === minIndex[1]
      );
      return closestPoint;
    } catch (err) {
      console.log("Error in findClosestPoint:", err);
      throw err;
    }
  }

  /**
   * Returns the points used by the AERMOD page to draw tiles on the map
   *
   * @returns pointsByTile
   */
  getCornerPoints() {
    const parsedData = Papa.parse(this.tileDomainInfo, {
      header: true,
      skipEmptyLines: true,
    });

    // Reduce the dataset to just tile corner points and get rid of deadzones
    const cornerPoints = filterCornerPoints(parsedData);
    const updatedCornerPoints = updateCornerCoordinates(cornerPoints);

    // Group points by tile_id
    const pointsByTile = updatedCornerPoints.reduce((acc, point) => {
      acc[point.tile_id] = acc[point.tile_id] || [];
      acc[point.tile_id].push(point);
      return acc;
    }, {});

    return pointsByTile;
  }
}
