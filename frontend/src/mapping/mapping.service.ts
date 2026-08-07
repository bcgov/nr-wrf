import { Injectable } from '@nestjs/common';
const fs = require('fs');
import * as Papa from 'papaparse';
import { ProjInfo } from '../../util/constants';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, map } from 'rxjs';

let hostname: string;
let port: number;

interface AermodTileRow {
  domain: string;
  tile: string;
  I0: number;
  J0: number;
  I1: number;
  J1: number;
  lat0: number;
  lon0: number;
  lat1: number;
  lon1: number;
  url: string;
}

@Injectable()
export class MappingService {
  private aermodFilesCsv: string;
  private aermodRows: AermodTileRow[];
  private calpuffDomains: any[];
  private calpuffTiles: any[];

  constructor(private httpService: HttpService) {
    // docker hostname is the container name, use localhost for local development
    hostname = process.env.BACKEND_URL ? process.env.BACKEND_URL : `http://localhost`;
    // local development backend port is 3001, docker backend port is 3000
    // port = process.env.BACKEND_URL ? 3000 : 3001;
    port = 3000; // frontend = 8080, backend = 3000 for now
  }

  onModuleInit() {
    try {
      this.aermodFilesCsv = fs.readFileSync('dist/public/js/gis/aermod_files.csv', 'utf-8');
      this.aermodRows = this.parseAermodRows(this.aermodFilesCsv);
      this.calpuffDomains = JSON.parse(fs.readFileSync('dist/public/js/gis/hr_domain_bounds.json', 'utf-8'));
      this.calpuffTiles = JSON.parse(fs.readFileSync('dist/public/js/gis/hr_domain_tiles.json', 'utf-8'));
      console.log('AERMOD files loaded into memory.');
      console.log('CALPUFF HR domains loaded into memory.');
      console.log('CALPUFF HR tiles loaded into memory.');
    } catch (error) {
      console.log('Error loading tile data into memory:');
      console.log(error);
    }
  }

  /**
   * Parse the AERMOD tile CSV once into typed rows, coercing numeric fields
   * up front so downstream lookups don't re-parse the CSV text or re-run
   * parseInt/parseFloat/isNaN on every request.
   */
  private parseAermodRows(csvText: string): AermodTileRow[] {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const rows: AermodTileRow[] = [];
    for (const entry of parsed.data as any[]) {
      if (!entry) continue;

      const I0 = parseInt(entry.I0, 10);
      const J0 = parseInt(entry.J0, 10);
      const I1 = parseInt(entry.I1, 10);
      const J1 = parseInt(entry.J1, 10);
      const lat0 = parseFloat(entry.lat0);
      const lon0 = parseFloat(entry.lon0);
      const lat1 = parseFloat(entry.lat1);
      const lon1 = parseFloat(entry.lon1);

      if ([I0, J0, I1, J1, lat0, lon0, lat1, lon1].some((v) => isNaN(v))) continue;

      rows.push({
        domain: entry.domain,
        tile: entry.tile,
        I0,
        J0,
        I1,
        J1,
        lat0,
        lon0,
        lat1,
        lon1,
        url: entry.url,
      });
    }

    return rows;
  }

  async calculateVars(
    bottomLeftYGlobal: number,
    topRightYGlobal: number,
    bottomLeftXGlobal: number,
    topRightXGlobal: number
  ): Promise<any> {
    const requestUrl = `${hostname}:${port}/data`;
    const data = await lastValueFrom(
      this.httpService
        .post(requestUrl, {
          bottomLeftYGlobal,
          topRightYGlobal,
          bottomLeftXGlobal,
          topRightXGlobal,
        })
        .pipe(map((response) => response.data))
    );
    return data;
  }

  getAermodTiles() {
    try {
      const data = fs.readFileSync('dist/public/js/gis/aermod_tiles_extended.json', 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read aermod_tiles_extended.json:', err);
      return [];
    }
  }

  /**
   * For AERMOD: Find all domain/tile pairs that overlap with the closest d02 tile.
   * Returns the d02 tile info plus any high-resolution tiles that overlap.
   *
   * @param latitude
   * @param longitude
   * @returns { domainTile: { tile: number, domain: string, corners: {...} }, domainTiles: [{ domain: string, tiles: string[] }] }
   */
  async calculateAermodTiles(latitude: number, longitude: number): Promise<any> {
    // Find the closest tile to get the bounding box
    //const closestTileData = await this.findClosestD02Tile(latitude, longitude);
    const closestTileData = await this.findClosestPoint(latitude, longitude);

    console.log('~~~');
    console.log(closestTileData);
    console.log('~~~');

    if (!closestTileData) {
      console.error('Failed to find closest d02 tile');
      return null;
    }

    // findClosestPoint only returns {i, j, tile, domain, url} - look up this
    // tile's corners from its domain's CSV (aermod for d02, calpuff for d03-d06).
    const corners = this.getTileCorners(closestTileData.domain, closestTileData.tile);
    if (!corners) {
      console.error('Failed to find corners for closest tile', closestTileData);
      return null;
    }

    // Extract corner coordinates
    const { lat0, lon0, lat1, lon1 } = corners;

    // Map corners to boundary variables
    // lat0, lon0 = NE corner (top-right)
    // lat1, lon1 = SW corner (bottom-left)
    const bottomLeftYGlobal = lat1; // SW latitude
    const topRightYGlobal = lat0; // NE latitude
    const bottomLeftXGlobal = lon1; // SW longitude
    const topRightXGlobal = lon0; // NE longitude

    // Call backend to get all overlapping domain/tile pairs
    const requestUrl = `${hostname}:${port}/data/aermodDomainTiles`;
    const domainTiles = await lastValueFrom(
      this.httpService
        .post(requestUrl, {
          bottomLeftYGlobal,
          topRightYGlobal,
          bottomLeftXGlobal,
          topRightXGlobal,
        })
        .pipe(map((response) => response.data))
    );

    console.log('Domain tiles found:', domainTiles);

    return {
      domainTile: { ...closestTileData, corners },
      domainTiles,
    };
  }

  //Note: commented out because of WRF-6 ticket
  // async findClosestD02Tile(latitude: number, longitude: number): Promise<any> {
  //   try {
  //     let closestTile = null;
  //     let minDistance = Infinity;
  //     let closestCorners = { lat0: null, lon0: null, lat1: null, lon1: null };

  //     this.aermodRows.forEach((row) => {
  //       if (row.domain !== 'd02') return;

  //       // Calculate tile center
  //       const centerLat = (row.lat0 + row.lat1) / 2;
  //       const centerLon = (row.lon0 + row.lon1) / 2;

  //       // Calculate distance to tile center
  //       const dist = Math.sqrt((latitude - centerLat) ** 2 + (longitude - centerLon) ** 2);

  //       if (dist < minDistance) {
  //         minDistance = dist;
  //         closestTile = parseInt(row.tile, 10);
  //         closestCorners = { lat0: row.lat0, lon0: row.lon0, lat1: row.lat1, lon1: row.lon1 };
  //       }
  //     });

  //     console.log(
  //       `findClosestD02Tile: lat=${latitude}, lon=${longitude} -> tile=${closestTile}, distance=${minDistance}`
  //     );

  //     return {
  //       tile: closestTile,
  //       domain: 'd02',
  //       corners: closestCorners,
  //     };
  //   } catch (err) {
  //     console.log('Error in findClosestD02Tile');
  //     console.log(err);
  //     return null;
  //   }
  // }

  findIjForHrDomain(hrTile: any, latitude: number, longitude: number) {
    const domain = hrTile.domain;

    // Each nested domain (d03-d06) has its own local I/J grid, so i,j must
    // be interpolated from that domain's own tile CSV rather than the
    // shared d02 projection.
    const domainMatch = this.findIJInDomainCsv(this.aermodRows, domain, latitude, longitude);

    let i = domainMatch ? domainMatch.i : null;
    let j = domainMatch ? domainMatch.j : null;
    let tile = domainMatch ? domainMatch.tile : null;
    let url = domainMatch ? domainMatch.url : null;

    if (tile === null) {
      // Point is inside the domain polygon but didn't land inside any
      // tile's bounding box (e.g. right on a domain edge) - fall back to
      // nearest tile by center distance.
      let minDist = Infinity;
      for (const d of this.calpuffTiles) {
        if (d.domain === domain) {
          for (const t of d.tiles) {
            const lats = t.corners.map((c) => c.lat);
            const lons = t.corners.map((c) => c.lon);
            const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
            const dist = Math.sqrt((latitude - centerLat) ** 2 + (longitude - centerLon) ** 2);
            if (dist < minDist) {
              minDist = dist;
              tile = t.tileId;
            }
          }
        }
      }
    }

    console.log(
      `findClosestPoint: lat=${latitude}, lon=${longitude} -> i=${i}, j=${j}, domain=${domain}, tile=${tile}`
    );
    return { i, j, tile, domain, url };
  }

  async findClosestPoint(latitude: number, longitude: number): Promise<any> {
    try {
      const hrTile = this.isInsideHRDomain(latitude, longitude);

      if (hrTile) return this.findIjForHrDomain(hrTile, latitude, longitude);

      //For non-HR domain
      // find the tile and calculate i,j based on lat/lon from cached CSV rows
      let i = null;
      let j = null;
      let tile = null;
      let url = null;
      let minDistance = Infinity;
      const proj = this.getProjInfo();

      for (const row of this.aermodRows) {
        if (row.domain !== 'd02') continue;

        const { I0, J0, I1, J1, lat0, lon0, lat1, lon1 } = row; // lat0,lon0 = NE; lat1,lon1 = SW

        // Check if point is within the tile's bounding box
        const minLat = Math.min(lat0, lat1);
        const maxLat = Math.max(lat0, lat1);
        const minLon = Math.min(lon0, lon1);
        const maxLon = Math.max(lon0, lon1);

        if (latitude >= minLat && latitude <= maxLat && longitude >= minLon && longitude <= maxLon) {
          // Interpolate i,j within the tile
          const dLon = lon1 - lon0;
          const dLat = lat0 - lat1; // lat0 > lat1
          const i_interp = I0 + ((longitude - lon0) / dLon) * (I1 - I0);
          const j_interp = J0 + ((lat0 - latitude) / dLat) * (J1 - J0);

          i = Math.round(i_interp);
          j = Math.round(j_interp);
          tile = parseInt(row.tile, 10);
          url = row.url;
          // Point is confirmed inside this tile - stop scanning. Otherwise the
          // corner-distance fallback below would keep running for every
          // remaining row and could overwrite tile/url with a different tile.
          break;
        }

        // Cheap O(1) lower bound: distance from the point to this tile's
        // axis-aligned bounding box. If even that already exceeds the best
        // distance found so far, this tile's corners (nw/se included, since
        // they sit at/near the same box) can't possibly win, so skip the
        // expensive projection math below entirely.
        const clampedLat = Math.max(minLat, Math.min(maxLat, latitude));
        const clampedLon = Math.max(minLon, Math.min(maxLon, longitude));
        const boxDist = Math.sqrt((latitude - clampedLat) ** 2 + (longitude - clampedLon) ** 2);
        if (boxDist >= minDistance) continue;

        // If not inside, calculate distance to each corner
        const ne = { lat: lat0, lon: lon0 };
        const sw = { lat: lat1, lon: lon1 };
        const nw = this.calculateMissingCorner(ne, sw, I0, J1, I0, J0, I1, J1, proj);
        const se = this.calculateMissingCorner(ne, sw, I1, J0, I0, J0, I1, J1, proj);

        const corners = [ne, nw, sw, se];
        corners.forEach((corner) => {
          const dist = Math.sqrt((latitude - corner.lat) ** 2 + (longitude - corner.lon) ** 2);
          if (dist < minDistance) {
            minDistance = dist;
            tile = parseInt(row.tile, 10);
            url = row.url;
          }
        });
      }

      if (i === null) {
        // Point not inside any tile, use projected calculation (reuses the
        // proj computed above - it's the same static projection either way)
        const { x, y } = this.latLonToProjected(latitude, longitude, proj);
        // x and y are decimal WRF i/j coordinates calculated from the Lambert projection.
        const rawI = Math.round(x - 0.1);
        const rawJ = Math.round(y - 0.1);

        // Guard: reject points that fall outside the d02 domain entirely,
        // rather than silently clamping them to the domain edge.
        const D02_MIN_I = 2;
        const D02_MAX_I = 391;
        const D02_MIN_J = 2;
        const D02_MAX_J = 373;
        if (rawI < D02_MIN_I || rawI > D02_MAX_I || rawJ < D02_MIN_J || rawJ > D02_MAX_J) {
          console.error(
            `findClosestPoint: lat=${latitude}, lon=${longitude} is outside the d02 domain (i=${rawI}, j=${rawJ})`
          );
          return null;
        }

        i = rawI;
        j = rawJ;

        // tile is already set to the closest
      }

      console.log(`findClosestPoint: lat=${latitude}, lon=${longitude} -> i=${i}, j=${j}, tile=${tile}`);
      return { i, j, tile, domain: 'd02', url };
    } catch (err) {
      console.log('Error in findClosestPoint');
      console.log(err);
      return null;
    }
  }

  /**
   * Look up a tile's corner lat/lon by domain + tile id, from that domain's
   * CSV (aermod_files.csv for d02, calpuff_files.csv for d03-d06). Normalizes
   * to NE (lat0,lon0) / SW (lat1,lon1) regardless of how the source CSV
   * orders its corner columns - aermod_files.csv and calpuff_files.csv use
   * opposite conventions.
   */
  private getTileCorners(
    domain: string,
    tile: string | number
  ): { lat0: number; lon0: number; lat1: number; lon1: number } | null {
    for (const row of this.aermodRows) {
      if (row.domain !== domain || String(row.tile) !== String(tile)) continue;

      return {
        lat0: Math.max(row.lat0, row.lat1), // NE
        lon0: Math.max(row.lon0, row.lon1), // NE
        lat1: Math.min(row.lat0, row.lat1), // SW
        lon1: Math.min(row.lon0, row.lon1), // SW
      };
    }

    return null;
  }

  /**
   * Find i,j and tile for a lat/lon within a specific domain's own tile grid,
   * using that domain's local I0/J0/I1/J1 indices from the tile CSV. Each
   * nested domain (d03-d06) has its own grid, distinct from d02's, and
   * different domains order their corners differently (e.g. lat0 is not
   * always the northern corner), so the interpolation below is direction-agnostic.
   */
  private findIJInDomainCsv(
    rows: AermodTileRow[],
    domain: string,
    latitude: number,
    longitude: number
  ): { i: number; j: number; tile: string; url: string } | null {
    for (const row of rows) {
      if (row.domain !== domain) continue;

      const { I0, J0, I1, J1, lat0, lon0, lat1, lon1 } = row;

      const minLat = Math.min(lat0, lat1);
      const maxLat = Math.max(lat0, lat1);
      const minLon = Math.min(lon0, lon1);
      const maxLon = Math.max(lon0, lon1);

      if (latitude >= minLat && latitude <= maxLat && longitude >= minLon && longitude <= maxLon) {
        const i = Math.round(I0 + ((longitude - lon0) / (lon1 - lon0)) * (I1 - I0));
        const j = Math.round(J0 + ((latitude - lat0) / (lat1 - lat0)) * (J1 - J0));
        return { i, j, tile: row.tile, url: row.url };
      }
    }

    return null;
  }

  isInsideHRDomain(latitude: number, longitude: number): any {
    for (const domain of this.calpuffDomains) {
      if (this.isPointInPolygon({ lat: latitude, lon: longitude }, domain.corners)) {
        return domain;
      }
    }
    return null;
  }

  private isPointInPolygon(point: { lat: number; lon: number }, polygon: { lat: number; lon: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lon,
        yi = polygon[i].lat;
      const xj = polygon[j].lon,
        yj = polygon[j].lat;
      if (yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Calculate a missing corner using the known anchor points from the CSV.
   * Instead of using the global projection reference, we use the known CSV
   * lat/lon values as local anchors and compute offsets based on grid spacing.
   *
   * @param ne - Known NE corner {lat, lon} from CSV
   * @param sw - Known SW corner {lat, lon} from CSV
   * @param targetI - I index of the corner to calculate
   * @param targetJ - J index of the corner to calculate
   * @param neI - I index of NE corner (I0)
   * @param neJ - J index of NE corner (J0)
   * @param swI - I index of SW corner (I1)
   * @param swJ - J index of SW corner (J1)
   * @param proj - Projection info
   */
  private calculateMissingCorner(
    ne: { lat: number; lon: number },
    sw: { lat: number; lon: number },
    targetI: number,
    targetJ: number,
    neI: number,
    neJ: number,
    swI: number,
    swJ: number,
    proj: ProjInfo
  ): { lat: number; lon: number } {
    // Convert known corners to projected coordinates
    const neProj = this.latLonToProjected(ne.lat, ne.lon, proj);
    const swProj = this.latLonToProjected(sw.lat, sw.lon, proj);

    // Grid steps from NE to SW
    const dI = swI - neI;
    const dJ = swJ - neJ;

    // Avoid edge cases
    if (dI === 0 && dJ === 0) {
      return ne;
    }

    // Projected displacement from NE to SW
    const dxTotal = swProj.x - neProj.x;
    const dyTotal = swProj.y - neProj.y;

    // Use the projection's theoretical grid spacing to estimate the I and J
    // direction vectors. In a Lambert Conformal Conic projection with uniform
    // 4km grid spacing, moving 1 cell in I direction gives approximately
    // dx = 4000m (proj.dx) and moving 1 cell in J gives dy = 4000m (proj.dy).
    // However, we need to account for grid rotation.
    //
    // We can estimate the unit vectors by solving:
    //   dI * uI_x + dJ * uJ_x = dxTotal
    //   dI * uI_y + dJ * uJ_y = dyTotal
    //
    // With constraints that |uI| ≈ |uJ| ≈ grid spacing and uI ⊥ uJ
    //
    // A simpler approach: assume the grid locally is a parallelogram and
    // decompose based on the ratio of dI to dJ.

    // For this tile, calculate per-cell displacement estimates
    // by using the known diagonal and the grid step counts.
    const gridSpacing = proj.dx; // 4000 meters

    // The diagonal distance in projected space
    const diagonalDist = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);

    // Expected diagonal based on grid spacing (Pythagorean)
    const expectedDiagonal = gridSpacing * Math.sqrt(dI * dI + dJ * dJ);

    // Scale factor (should be close to 1 if the projection is consistent)
    const scale = expectedDiagonal > 0 ? diagonalDist / expectedDiagonal : 1;

    // For a Lambert Conformal grid, I increases roughly eastward (positive x)
    // and J increases roughly northward (positive y).
    // However, there's some rotation. We estimate the rotation from the diagonal.

    // Angle of the diagonal in projected space
    const diagAngle = Math.atan2(dyTotal, dxTotal);

    // Angle the diagonal should make if the grid were axis-aligned
    // tan(theta) = dJ / dI
    const gridAngle = Math.atan2(dJ, dI);

    // Rotation between grid space and projected space
    const rotation = diagAngle - gridAngle;

    // Unit vectors for I and J directions in projected space
    const uIx = gridSpacing * scale * Math.cos(rotation);
    const uIy = gridSpacing * scale * Math.sin(rotation);
    const uJx = gridSpacing * scale * Math.cos(rotation + Math.PI / 2);
    const uJy = gridSpacing * scale * Math.sin(rotation + Math.PI / 2);

    // Target corner offset from NE in grid space
    const deltaI = targetI - neI;
    const deltaJ = targetJ - neJ;

    // Target position in projected space
    const targetX = neProj.x + deltaI * uIx + deltaJ * uJx;
    const targetY = neProj.y + deltaI * uIy + deltaJ * uJy;

    // Convert back to lat/lon
    return this.projectedToLatLon(targetX, targetY, proj);
  }

  /**
   * Convert lat/lon to projected (x, y) coordinates using Lambert Conformal Conic.
   */
  private latLonToProjected(lat: number, lon: number, proj: ProjInfo): { x: number; y: number } {
    const RAD_PER_DEG = Math.PI / 180.0;

    const tl1r = proj.truelat1 * RAD_PER_DEG;
    const ctl1r = Math.cos(tl1r);

    let deltalon = lon - proj.stdlon;
    if (deltalon > 180.0) deltalon -= 360.0;
    if (deltalon < -180.0) deltalon += 360.0;

    const rm =
      ((proj.rebydx * ctl1r) / proj.cone) *
      Math.pow(
        Math.tan(((90.0 * proj.hemi - lat) * RAD_PER_DEG) / 2.0) /
          Math.tan(((90.0 * proj.hemi - proj.truelat1) * RAD_PER_DEG) / 2.0),
        proj.cone
      );

    const arg = proj.cone * (deltalon * RAD_PER_DEG);
    const x = proj.polei + proj.hemi * rm * Math.sin(arg);
    const y = proj.polej - rm * Math.cos(arg);

    return { x, y };
  }

  /**
   * Convert projected (x, y) coordinates back to lat/lon.
   */
  private projectedToLatLon(x: number, y: number, proj: ProjInfo): { lat: number; lon: number } {
    const RAD_PER_DEG = Math.PI / 180.0;
    const DEG_PER_RAD = 180.0 / Math.PI;

    const dx = x - proj.polei;
    const dy = proj.polej - y;

    const rm = Math.sqrt(Math.pow(dx / proj.hemi, 2) + Math.pow(dy, 2));
    const arg = Math.atan2(dx / proj.hemi, dy);

    const deltalon = (arg / proj.cone) * DEG_PER_RAD;
    let lon = proj.stdlon + deltalon;

    const ctl1r = Math.cos(proj.truelat1 * RAD_PER_DEG);
    const T1 = Math.tan(((90.0 * proj.hemi - proj.truelat1) * RAD_PER_DEG) / 2.0);

    const tan_half = T1 * Math.pow((rm * proj.cone) / (proj.rebydx * ctl1r), 1.0 / proj.cone);
    const half_angle = Math.atan(tan_half);
    const lat = 90.0 * proj.hemi - 2.0 * half_angle * DEG_PER_RAD;

    if (lon > 180.0) lon -= 360.0;
    if (lon < -180.0) lon += 360.0;

    return { lat, lon };
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
    //proj.stdlon = -125.0;
    //proj.truelat1 = 46.5;
    //proj.truelat2 = 63.5;

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

    // Compute polei and polej based on known lat/lon at knowni, knownj
    const tl1r = proj.truelat1 * RAD_PER_DEG;
    const ctl1r = Math.cos(tl1r);

    let deltalon_known = proj.lon1 - proj.stdlon;
    if (deltalon_known > 180.0) deltalon_known -= 360.0;
    if (deltalon_known < -180.0) deltalon_known += 360.0;

    const rm_known =
      ((proj.rebydx * ctl1r) / proj.cone) *
      Math.pow(
        Math.tan(((90.0 * proj.hemi - proj.lat1) * RAD_PER_DEG) / 2.0) /
          Math.tan(((90.0 * proj.hemi - proj.truelat1) * RAD_PER_DEG) / 2.0),
        proj.cone
      );

    const arg_known = proj.cone * (deltalon_known * RAD_PER_DEG);

    proj.polei = proj.hemi * proj.knowni - proj.hemi * rm_known * Math.sin(arg_known);
    proj.polej = proj.hemi * proj.knownj + rm_known * Math.cos(arg_known);

    if (proj.stdlon < -180.0) {
      proj.stdlon += 360.0;
    }

    if (proj.stdlon > 180.0) {
      proj.stdlon -= 360.0;
    }

    return proj;
  }
}
