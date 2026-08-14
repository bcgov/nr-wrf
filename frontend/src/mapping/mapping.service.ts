import { Injectable } from '@nestjs/common';
const fs = require('fs');
import * as Papa from 'papaparse';
import { ProjInfo, WRF_DOMAINS } from '../../util/constants';
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
  /** Per-domain Lambert projections (d02 @ 4km, d03-d06 @ 1.333km), built from the CSV anchors. */
  private domainProjections: { [domain: string]: ProjInfo } = {};
  /** HR domains are checked before the coarse d02 fallback (resolution priority). */
  private static readonly DOMAIN_SEARCH_ORDER = ['d03', 'd04', 'd05', 'd06', 'd02'];

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
      this.buildDomainProjections();
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

  /**
   * Build one Lambert Conformal projection per domain found in the CSV. All
   * WRF nests share the same map projection (stdlon/truelat); only the grid
   * spacing (dx) and the anchor point differ per domain. Both come from the
   * WRF_DOMAINS configuration in util/constants.ts.
   *
   * The anchor for every domain is, by policy, its official lower-left corner
   * mass point (grid point (1, 1)) from the WRF domain definition. The lat/lon
   * and I/J values in aermod_files.csv are NOT used for anchoring - the CSV is
   * a tile inventory only. A domain present in the CSV but missing from
   * WRF_DOMAINS gets no projection: searches in it will report out-of-bounds
   * until its dx and LLCRN anchor are added to WRF_DOMAINS.
   */
  private buildDomainProjections(): void {
    this.domainProjections = {};
    for (const row of this.aermodRows) {
      if (this.domainProjections[row.domain]) continue;

      const config = WRF_DOMAINS[row.domain];
      if (!config) {
        console.error(
          `Domain ${row.domain} appears in aermod_files.csv but has no WRF_DOMAINS entry in util/constants.ts; ` +
            `it will not be searchable until its dx and LLCRN anchor are added there.`
        );
        continue;
      }

      // Anchor: domain's lower-left mass point is grid point (1, 1)
      this.domainProjections[row.domain] = this.getProjInfo(config.dx, config.llcrnLat, config.llcrnLon, 1, 1);
    }
    console.log(`Built projections for domains: ${Object.keys(this.domainProjections).join(', ')}`);
  }

  /**
   * Flowchart algorithm:
   *  1. Loop through HR domains (d03-d06) before d02.
   *  2. For each domain, convert lat/lon to decimal WRF i/j using that
   *     domain's own projection (its dx and its anchor mass point).
   *  3. Round to the nearest mass-grid point.
   *  4. Check whether i/j falls inside any of that domain's tile I/J ranges
   *     from aermod_files.csv. If yes, return {domain, tile, i, j}.
   *  5. Fall back to d02 if no HR match; return null if outside d02 too.
   */
  async findClosestPoint(latitude: number, longitude: number): Promise<any> {
    try {
      for (const domain of MappingService.DOMAIN_SEARCH_ORDER) {
        const proj = this.domainProjections[domain];
        if (!proj) continue;

        // Decimal WRF i/j in this domain's own grid
        const { x, y } = this.latLonToProjected(latitude, longitude, proj);
        const i = Math.round(x);
        const j = Math.round(y);

        // Does this mass point land inside one of the domain's tiles?
        for (const row of this.aermodRows) {
          if (row.domain !== domain) continue;
          if (i >= row.I0 && i <= row.I1 && j >= row.J0 && j <= row.J1) {
            console.log(
              `findClosestPoint: lat=${latitude}, lon=${longitude} -> domain=${domain}, i=${i}, j=${j}, tile=${row.tile}`
            );
            return { i, j, tile: row.tile, domain, url: row.url };
          }
        }
      }

      // Outside every domain, including d02
      console.error(`findClosestPoint: lat=${latitude}, lon=${longitude} is outside all model domains`);
      return null;
    } catch (err) {
      console.log('Error in findClosestPoint');
      console.log(err);
      return null;
    }
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

  /**
   * Build a Lambert Conformal Conic projection for one WRF domain.
   *
   * All parameters are intentionally required (no defaults): the anchor is a
   * four-number fact - (knownLat, knownLon) and the grid indices
   * (knowni, knownj) of the SAME mass point - and every caller must supply a
   * complete, matching set. See WRF_DOMAINS in util/constants.ts.
   *
   * @param dx - Grid spacing in meters (4000 for d02, 1333.33 for d03-d06)
   * @param knownLat - Latitude of a known mass point in this domain
   * @param knownLon - Longitude of that known mass point
   * @param knowni - The WRF i index of the known mass point
   * @param knownj - The WRF j index of the known mass point
   */
  private getProjInfo(dx: number, knownLat: number, knownLon: number, knowni: number, knownj: number): ProjInfo {
    enum WrfProjectionType {
      LambertConformal = 1,
      PolarSterographic = 2,
      Mercator = 3,
    }

    const RAD_PER_DEG = Math.PI / 180.0;

    let proj = new ProjInfo();

    proj.code = WrfProjectionType.LambertConformal;

    // DX and DY in meters (domain-specific)
    proj.dx = dx;
    proj.dy = dx;

    // Known mass point coordinate for this domain
    proj.lat1 = knownLat;
    proj.lon1 = knownLon;
    proj.knowni = knowni;
    proj.knownj = knownj;

    if (proj.code === WrfProjectionType.LambertConformal) {
      if (Math.abs(proj.truelat1 - proj.truelat2) > 0.1) {
        proj.cone =
          (Math.log(Math.cos(proj.truelat1 * RAD_PER_DEG)) - Math.log(Math.cos(proj.truelat2 * RAD_PER_DEG))) /
          (Math.log(Math.tan((90.0 - Math.abs(proj.truelat1)) * RAD_PER_DEG * 0.5)) -
            Math.log(Math.tan((90.0 - Math.abs(proj.truelat2)) * RAD_PER_DEG * 0.5)));
      } else {
        // Tangent cone (truelat1 == truelat2): cone = sin(truelat1).
        // The previous Math.sign(...) returned 1.0, which distorted every
        // projected i/j calculation.
        proj.cone = Math.sin(Math.abs(proj.truelat1) * RAD_PER_DEG);
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
