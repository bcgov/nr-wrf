import { Injectable } from '@nestjs/common';
const fs = require('fs');
import * as Papa from 'papaparse';
import { ProjInfo } from '../../util/constants';

interface CalpuffTileRecord {
  filename: string;
  year: number;
  month: number;
  domain: string;
  tileId: number | null;
  i0: number;
  j0: number;
  i1: number;
  j1: number;
  lat0: number;
  lon0: number;
  lat1: number;
  lon1: number;
  url: string;
  area: number;
}

@Injectable()
export class MappingService {
  private tileDomainInfo: string;
  private tileCorners: string;
  private aermodFilesCsv: string;
  private parsedTileDomainInfo: any;
  // private calpuffFilesCsv: string;
  // private calpuffTilesByDomain: Record<string, CalpuffTileRecord[]> = {};
  // private readonly calpuffDomainPreference = ['d06', 'd05', 'd04', 'd03', 'd02'];

  onModuleInit() {
    try {
      this.tileDomainInfo = fs.readFileSync('dist/public/js/gis/tile_domain_info.csv', 'utf-8');
      this.tileCorners = fs.readFileSync('dist/public/js/gis/tile_corners.csv', 'utf-8');
      this.aermodFilesCsv = fs.readFileSync('dist/public/js/gis/aermod_files.csv', 'utf-8');
      this.parsedTileDomainInfo = Papa.parse(this.tileDomainInfo, {
        header: true,
        skipEmptyLines: true,
      });
      // this.calpuffFilesCsv = fs.readFileSync('dist/public/js/gis/calpuff_files.csv', 'utf-8');
      // this.calpuffTilesByDomain = this.loadCalpuffTiles(this.calpuffFilesCsv);
      console.log('Tile domain info loaded into memory.');
      console.log('AERMOD files loaded into memory.');
      console.log('CALPUFF tile index loaded into memory.');
    } catch (error) {
      console.log('Error loading tile data into memory:');
      console.log(error);
    }
  }

  async findClosestPoint(latitude: number, longitude: number): Promise<any> {
    try {
      const parentIJ = this.findParentGridCell(latitude, longitude);

      const rawData = this.parsedTileDomainInfo;
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

  // /**
  //  * Returns the best matching CALPUFF tile (prefers higher-resolution domains) for a given lat/lon.
  //  */
  // async findCalpuffTile(latitude: number, longitude: number): Promise<CalpuffTileRecord | null> {
  //   try {
  //     const tile = this.pickBestCalpuffTile(latitude, longitude);
  //     return tile ?? null;
  //   } catch (err) {
  //     console.log('Error in findCalpuffTile');
  //     console.log(err);
  //     return null;
  //   }
  // }

  /**
   * Returns the AERMOD tiles with all four corners calculated
   */
  getAermodTiles() {
    const parsed = Papa.parse(this.aermodFilesCsv, {
      header: true,
      skipEmptyLines: true,
    });

    const proj = this.getProjInfo();

    const tiles = [];
    parsed.data.forEach((entry: any) => {
      if (!entry || entry.domain !== 'd02') return;

      const I0 = parseInt(entry.I0, 10);
      const J0 = parseInt(entry.J0, 10);
      const I1 = parseInt(entry.I1, 10);
      const J1 = parseInt(entry.J1, 10);

      if (isNaN(I0) || isNaN(J0) || isNaN(I1) || isNaN(J1)) return;

      // Given points
      const ne = this.ijToLatLon(I0, J0, proj); // lat0, lon0
      const sw = this.ijToLatLon(I1, J1, proj); // lat1, lon1

      // Calculate other corners
      const nw = this.ijToLatLon(I0, J1, proj); // northwest
      const se = this.ijToLatLon(I1, J0, proj); // southeast

      tiles.push({
        tileId: parseInt(entry.tile, 10),
        filename: entry.filename,
        year: parseInt(entry.year, 10),
        domain: entry.domain,
        I0,
        J0,
        I1,
        J1,
        // Four corners: NE, NW, SW, SE
        corners: [
          { lat: ne.lat, lon: ne.lon }, // NE
          { lat: nw.lat, lon: nw.lon }, // NW
          { lat: sw.lat, lon: sw.lon }, // SW
          { lat: se.lat, lon: se.lon }, // SE
        ],
        url: entry.url,
      });
    });

    return tiles;
  }

  private getProjInfo(): ProjInfo {
    enum WrfProjectionType {
      LambertConformal = 1,
      PolarSterographic = 2,
      Mercator = 3,
    }

    const RAD_PER_DEG = Math.PI / 180.0;

    let proj = new ProjInfo();

    proj.code = WrfProjectionType.LambertConformal;

    // DX in meters from (full domain)
    const DX: number = 4000.0;
    // DY in meters from (full domain)
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

    return proj;
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

  // private loadCalpuffTiles(csv: string): Record<string, CalpuffTileRecord[]> {
  //   const parsed = Papa.parse(csv, {
  //     header: true,
  //     skipEmptyLines: true,
  //   });

  //   const grouped: Record<string, CalpuffTileRecord[]> = {};

  //   parsed.data.forEach((entry: any) => {
  //     if (!entry || !entry.domain) {
  //       return;
  //     }

  //     const lat0 = parseFloat(entry.lat0);
  //     const lon0 = parseFloat(entry.lon0);
  //     const lat1 = parseFloat(entry.lat1);
  //     const lon1 = parseFloat(entry.lon1);

  //     if ([lat0, lon0, lat1, lon1].some((v) => Number.isNaN(v))) {
  //       return;
  //     }

  //     const tileId = entry.tile && entry.tile !== 'NA' ? parseInt(entry.tile, 10) : null;
  //     const i0 = parseInt(entry.I0 ?? entry.i0, 10);
  //     const j0 = parseInt(entry.J0 ?? entry.j0, 10);
  //     const i1 = parseInt(entry.I1 ?? entry.i1, 10);
  //     const j1 = parseInt(entry.J1 ?? entry.j1, 10);
  //     const year = parseInt(entry.year, 10);
  //     const month = parseInt(entry.month, 10);

  //     const record: CalpuffTileRecord = {
  //       filename: entry.filename,
  //       year,
  //       month,
  //       domain: entry.domain,
  //       tileId,
  //       i0,
  //       j0,
  //       i1,
  //       j1,
  //       lat0,
  //       lon0,
  //       lat1,
  //       lon1,
  //       url: entry.url,
  //       area: Math.abs(lat1 - lat0) * Math.abs(lon1 - lon0),
  //     };

  //     if ([record.i0, record.j0, record.i1, record.j1].some((v) => Number.isNaN(v))) {
  //       return;
  //     }

  //     if (!grouped[record.domain]) {
  //       grouped[record.domain] = [];
  //     }

  //     grouped[record.domain].push(record);
  //   });

  //   Object.keys(grouped).forEach((domain) => {
  //     grouped[domain] = grouped[domain].sort((a, b) => {
  //       if (a.tileId !== null && b.tileId === null) return -1;
  //       if (a.tileId === null && b.tileId !== null) return 1;
  //       if (a.area !== b.area) return a.area - b.area;
  //       return (a.tileId ?? Number.MAX_SAFE_INTEGER) - (b.tileId ?? Number.MAX_SAFE_INTEGER);
  //     });
  //   });

  //   return grouped;
  // }

  // private pickBestCalpuffTile(latitude: number, longitude: number): CalpuffTileRecord | null {
  //   for (const domain of this.calpuffDomainPreference) {
  //     const tiles = this.calpuffTilesByDomain[domain];
  //     if (!tiles || !tiles.length) {
  //       continue;
  //     }

  //     const match = tiles.find((tile) => this.isPointInTile(tile, latitude, longitude));
  //     if (match) {
  //       return match;
  //     }
  //   }

  //   return null;
  // }

  // private isPointInTile(tile: CalpuffTileRecord, latitude: number, longitude: number): boolean {
  //   const minLat = Math.min(tile.lat0, tile.lat1);
  //   const maxLat = Math.max(tile.lat0, tile.lat1);
  //   const minLon = Math.min(tile.lon0, tile.lon1);
  //   const maxLon = Math.max(tile.lon0, tile.lon1);

  //   return latitude >= minLat && latitude <= maxLat && longitude >= minLon && longitude <= maxLon;
  // }

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

  ijToLatLon(i: number, j: number, proj: ProjInfo): { lat: number; lon: number } {
    const RAD_PER_DEG = Math.PI / 180.0;
    const DEG_PER_RAD = 180.0 / Math.PI;

    // Ensure proj is initialized as in latlonToIj
    if (proj.polei === -999.9) {
      // Need to compute polei, polej, etc. by calling llijLc with known point
      this.llijLc(proj.lat1, proj.lon1, proj);
    }

    // Reverse the i,j to di,dj (inverse of: i = round(hemi * di - 0.1))
    let di = (i + 0.1) / proj.hemi;
    let dj = (j + 0.1) / proj.hemi;

    // From forward transform:
    // di = polei + hemi * rm * sin(arg)
    // dj = polej - rm * cos(arg)
    // So:
    // x = di - polei = hemi * rm * sin(arg)
    // y = polej - dj = rm * cos(arg)
    let x = di - proj.polei;
    let y = proj.polej - dj;

    // Calculate rm and arg
    let rm = Math.sqrt(Math.pow(x / proj.hemi, 2) + Math.pow(y, 2));
    let arg = Math.atan2(x / proj.hemi, y);

    // Calculate longitude
    // From forward: arg = cone * deltalon * RAD_PER_DEG
    // So: deltalon = arg / cone / RAD_PER_DEG
    let deltalon = (arg / proj.cone) * DEG_PER_RAD;
    let lon = proj.stdlon + deltalon;

    // Calculate latitude
    // From forward: rm = (rebydx * ctl1r / cone) * (tan((90*hemi - lat)*RAD/2) / tan((90*hemi - truelat1)*RAD/2))^cone
    // Let T1 = tan((90*hemi - truelat1)*RAD/2)
    // rm = (rebydx * ctl1r / cone) * (tan_half / T1)^cone
    // tan_half^cone = rm * cone / (rebydx * ctl1r) * T1^cone
    // tan_half = (rm * cone / (rebydx * ctl1r))^(1/cone) * T1
    let ctl1r = Math.cos(proj.truelat1 * RAD_PER_DEG);
    let T1 = Math.tan(((90.0 * proj.hemi - proj.truelat1) * RAD_PER_DEG) / 2.0);

    let tan_half = T1 * Math.pow((rm * proj.cone) / (proj.rebydx * ctl1r), 1.0 / proj.cone);
    let half_angle = Math.atan(tan_half);
    // (90*hemi - lat) * RAD / 2 = half_angle
    // lat = 90*hemi - 2 * half_angle / RAD
    let lat = 90.0 * proj.hemi - 2.0 * half_angle * DEG_PER_RAD;

    // Normalize longitude
    if (lon > 180.0) lon -= 360.0;
    if (lon < -180.0) lon += 360.0;

    return { lat, lon };
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
