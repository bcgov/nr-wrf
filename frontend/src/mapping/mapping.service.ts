import { Injectable } from '@nestjs/common';
const fs = require('fs');
import * as Papa from 'papaparse';
import { ProjInfo } from '../../util/constants';

@Injectable()
export class MappingService {
  private tileDomainInfo: string;
  private tileCorners: string;
  private parsedTileDomainInfo: any;

  onModuleInit() {
    try {
      this.tileDomainInfo = fs.readFileSync('dist/public/js/gis/tile_domain_info.csv', 'utf-8');
      this.tileCorners = fs.readFileSync('dist/public/js/gis/tile_corners.csv', 'utf-8');
      this.parsedTileDomainInfo = Papa.parse(this.tileDomainInfo, {
        header: true,
        skipEmptyLines: true,
      });
      console.log('Tile domain info loaded into memory.');
    } catch (error) {
      console.log('Error loading tile domain info into memory:');
      console.log(error);
    }
  }

  async findClosestPoint(latitude: number, longitude: number): Promise<any> {
    try {
      const parentIJ = this.findParentGridCell(latitude, longitude);
      console.log('findParentGridCell(desiredLatitude, desiredLongitude)');
      console.log(parentIJ);
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
      const closestPoint = parsedData.find((point) => point.i === parentIJ.i_parent && point.j === parentIJ.j_parent);
      return closestPoint;
    } catch (err) {
      console.log('Error in findClosestPoint');
      console.log(err);
    }
  }

  /**
   * Returns the points used by the AERMOD page to draw tiles on the map
   *
   * @returns pointsByTile
   */
  getCornerPoints() {
    return this.csvToJson(this.tileCorners);
  }

  csvToJson(csvStr) {
    const lines = csvStr.split('\n');
    const result = {};

    lines.slice(1).forEach((line) => {
      const currentLine = line.split(',');
      const tile_id = currentLine[0];
      if (!isNaN(parseInt(tile_id, 10))) {
        const obj = {
          i: currentLine[1],
          j: currentLine[2],
          lon: currentLine[3],
          lat: currentLine[4],
          tile_id: parseInt(tile_id, 10),
        };
        if (!result[tile_id]) {
          result[tile_id] = [];
        }

        result[tile_id].push(obj);
      }
    });

    return result;
  }

  /** Tile info section */
  findParentGridCell(latitude: number, longitude: number): { i_parent: number; j_parent: number } {
    const result = this.latlonToIj(latitude, longitude);
    return result; // Directly return the object containing i_parent and j_parent
  }

  findTileGridCell(i_parent: number, j_parent: number): { i_nest: number; j_nest: number } {
    //Number of grid cells per tile
    const TILE_SIZE: number = 10;
    let i_nest: number;
    let j_nest: number;

    if (i_parent % 10 !== 0) {
      i_nest = Math.floor(i_parent / TILE_SIZE + 0.5);
    } else {
      i_nest = Math.floor(i_parent / TILE_SIZE + (i_parent % TILE_SIZE));
    }

    if (j_parent % 10 !== 0) {
      j_nest = Math.floor(j_parent / TILE_SIZE + 0.5);
    } else {
      j_nest = Math.floor(j_parent / TILE_SIZE + (j_parent % TILE_SIZE));
    }

    // TODO: If all is well, i should never exceed 48
    i_nest = Math.min(48, i_nest);

    // TODO: If all is well, j should never exceed 43
    j_nest = Math.min(43, j_nest);

    return { i_nest, j_nest };
  }

  getTileFolder(i_10x10: number, j_10x10: number): number {
    // Folders start at number 001 in the bottom left (SW) corner
    // and counting from left to right (west to east) and bottom to top (south to north).
    let folder = i_10x10 + 48 * (j_10x10 - 1);
    return folder;
  }

  llijLc(lat: number, lon: number, proj: ProjInfo): { i: number; j: number } {
    if (Math.abs(proj.truelat2) > 90.0) {
      proj.truelat2 = proj.truelat1;
    }

    let deltalon1: number;
    let deltalon: number;
    let arg: number;
    let tl1r: number;
    let rm: number;
    let ctl1r: number;

    const RAD_PER_DEG = Math.PI / 180.0;

    deltalon1 = proj.lon1 - proj.stdlon;
    if (deltalon1 > 180.0) deltalon1 -= 360;
    if (deltalon1 < -180.0) deltalon1 += 360;

    tl1r = proj.truelat1 * RAD_PER_DEG;
    ctl1r = Math.cos(tl1r);

    proj.rsw =
      ((proj.rebydx * ctl1r) / proj.cone) *
      Math.pow(
        Math.tan(((90.0 * proj.hemi - proj.lat1) * RAD_PER_DEG) / 2.0) /
          Math.tan(((90.0 * proj.hemi - proj.truelat1) * RAD_PER_DEG) / 2.0),
        proj.cone
      );

    arg = proj.cone * (deltalon1 * RAD_PER_DEG);
    proj.polei = proj.hemi * proj.knowni - proj.hemi * proj.rsw * Math.sin(arg);
    proj.polej = proj.hemi * proj.knownj + proj.rsw * Math.cos(arg);

    deltalon = lon - proj.stdlon;
    if (deltalon > 180.0) deltalon -= 360.0;
    if (deltalon < -180.0) deltalon += 360.0;

    rm =
      ((proj.rebydx * ctl1r) / proj.cone) *
      Math.pow(
        Math.tan(((90.0 * proj.hemi - lat) * RAD_PER_DEG) / 2.0) /
          Math.tan(((90.0 * proj.hemi - proj.truelat1) * RAD_PER_DEG) / 2.0),
        proj.cone
      );

    arg = proj.cone * (deltalon * RAD_PER_DEG);
    let di = proj.polei + proj.hemi * rm * Math.sin(arg);
    let dj = proj.polej - rm * Math.cos(arg);

    let i = Math.round(proj.hemi * di - 0.1);
    let j = Math.round(proj.hemi * dj - 0.1);

    return { i, j };
  }

  latlonToIj(inputLat: number, inputLon: number): { i_parent: number; j_parent: number } {
    enum WrfProjectionType {
      LambertConformal = 1,
      PolarSterographic = 2,
      Mercator = 3,
    }

    const RAD_PER_DEG = Math.PI / 180.0;

    let proj = new ProjInfo();

    proj.code = WrfProjectionType.LambertConformal;

    //DX in meters from (full domain)
    const DX: number = 4000.0;
    //DY in meters from (full domain)
    const DY: number = 4000.0;
    // DX and DY in meters
    proj.dx = DX;
    proj.dy = DY;

    // STAND_LON, TRUELAT1, TRUELAT2
    proj.stdlon = -125.0;
    proj.truelat1 = 46.5;
    proj.truelat2 = 63.5;

    // Coordinate of Lower Left Grid Cell (1,1)
    proj.lat1 = 46.3873596;
    proj.lon1 = -137.7155914;

    if (proj.code === WrfProjectionType.LambertConformal) {
      if (Math.abs(proj.truelat1 - proj.truelat2) > 0.1) {
        proj.cone =
          (Math.log(Math.cos(proj.truelat1 * RAD_PER_DEG)) - Math.log(Math.cos(proj.truelat2 * RAD_PER_DEG))) /
          (Math.log(Math.tan((90.0 - Math.abs(proj.truelat1)) * RAD_PER_DEG * 0.5)) -
            Math.log(Math.tan((90.0 - Math.abs(proj.truelat2)) * RAD_PER_DEG * 0.5)));
      } else {
        proj.cone = Math.sign(Math.abs(proj.truelat1) * RAD_PER_DEG);
      }
    } else {
      throw new Error('Unsupported projection.');
    }

    if (proj.truelat1 < 0.0) {
      proj.hemi = -1.0;
    }

    proj.rebydx = proj.re_m / proj.dx;

    if (proj.stdlon < -180.0) {
      proj.stdlon += 360.0;
    }

    if (proj.stdlon > 180.0) {
      proj.stdlon -= 360.0;
    }

    // Find the I,J of the input coordinate in the full domain
    let { i, j } = this.llijLc(inputLat, inputLon, proj);

    return { i_parent: i, j_parent: j };
  }
}
