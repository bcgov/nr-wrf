import { Injectable } from '@nestjs/common';
const fs = require('fs');
import * as Papa from 'papaparse';
import { ProjInfo } from '../../util/constants';

@Injectable()
export class MappingService {
  private aermodFilesCsv: string;

  onModuleInit() {
    try {
      this.aermodFilesCsv = fs.readFileSync('dist/public/js/gis/aermod_files.csv', 'utf-8');
      // this.calpuffFilesCsv = fs.readFileSync('dist/public/js/gis/calpuff_files.csv', 'utf-8');
      // this.calpuffTilesByDomain = this.loadCalpuffTiles(this.calpuffFilesCsv);
      console.log('AERMOD files loaded into memory.');
      // console.log('CALPUFF tile index loaded into memory.');
    } catch (error) {
      console.log('Error loading tile data into memory:');
      console.log(error);
    }
  }

  async findClosestPoint(latitude: number, longitude: number): Promise<any> {
    try {
      // Sanity check: find the tile and calculate i,j based on lat/lon from CSV
      const parsed = Papa.parse(this.aermodFilesCsv, {
        header: true,
        skipEmptyLines: true,
      });

      let i = null;
      let j = null;
      let tile = null;
      let minDistance = Infinity;
      const proj = this.getProjInfo();

      parsed.data.forEach((entry: any) => {
        if (!entry || entry.domain !== 'd02') return;

        const I0 = parseInt(entry.I0, 10);
        const J0 = parseInt(entry.J0, 10);
        const I1 = parseInt(entry.I1, 10);
        const J1 = parseInt(entry.J1, 10);
        const lat0 = parseFloat(entry.lat0); // NE
        const lon0 = parseFloat(entry.lon0); // NE
        const lat1 = parseFloat(entry.lat1); // SW
        const lon1 = parseFloat(entry.lon1); // SW

        if (
          isNaN(I0) ||
          isNaN(J0) ||
          isNaN(I1) ||
          isNaN(J1) ||
          isNaN(lat0) ||
          isNaN(lon0) ||
          isNaN(lat1) ||
          isNaN(lon1)
        )
          return;

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
          tile = parseInt(entry.tile, 10);
        } else {
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
              tile = parseInt(entry.tile, 10);
            }
          });
        }
      });

      if (i === null) {
        // Point not inside any tile, use projected calculation
        const proj = this.getProjInfo();
        const { x, y } = this.latLonToProjected(latitude, longitude, proj);

        i = Math.round(1 + x / proj.dx);
        j = Math.round(1 + y / proj.dy);

        // Clamp to d02 domain bounds
        i = Math.max(2, Math.min(391, i));
        j = Math.max(2, Math.min(373, j));

        // tile is already set to the closest
      }

      console.log(`findClosestPoint: lat=${latitude}, lon=${longitude} -> i=${i}, j=${j}, tile=${tile}`);
      return { i, j, tile };
    } catch (err) {
      console.log('Error in findClosestPoint');
      console.log(err);
      return null;
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

  getAermodTilesSimplified() {
    try {
      const data = fs.readFileSync('dist/public/js/gis/aermod_tiles_extended.json', 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read aermod_tiles_extended.json:', err);
      return [];
    }
  }

  /**
   * Returns the AERMOD tiles with all four corners calculated.
   * Uses the CSV lat/lon values as control points and derives missing corners
   * using the Lambert Conformal Conic projection.
   *
   * CSV format: I0,J0 corresponds to NE corner (lat0,lon0)
   *             I1,J1 corresponds to SW corner (lat1,lon1)
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

      // Use the lat/lon values directly from the CSV as control points
      const lat0 = parseFloat(entry.lat0); // NE corner latitude
      const lon0 = parseFloat(entry.lon0); // NE corner longitude
      const lat1 = parseFloat(entry.lat1); // SW corner latitude
      const lon1 = parseFloat(entry.lon1); // SW corner longitude

      if (isNaN(I0) || isNaN(J0) || isNaN(I1) || isNaN(J1)) return;
      if (isNaN(lat0) || isNaN(lon0) || isNaN(lat1) || isNaN(lon1)) return;

      // Given control points from CSV (using actual lat/lon values)
      const ne = { lat: lat0, lon: lon0 }; // (I0, J0) - NE corner
      const sw = { lat: lat1, lon: lon1 }; // (I1, J1) - SW corner

      // Calculate missing corners using the projection
      // NW corner: same J as SW (J1), same I as NE (I0)
      // SE corner: same J as NE (J0), same I as SW (I1)
      const nw = this.calculateMissingCorner(ne, sw, I0, J1, I0, J0, I1, J1, proj);
      const se = this.calculateMissingCorner(ne, sw, I1, J0, I0, J0, I1, J1, proj);

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

    // return tiles;
    return this.extendTiles(tiles);
  }

  private extendTiles(tiles: any) {
    console.log('extending tiles');
    // For each tile, extend I0/I1 and J0/J1 by 0.5 and recalculate corners
    const proj = this.getProjInfo();
    return tiles.map((tile: any) => {
      // Extended indices
      const I0_ext = tile.I0 - 0.5;
      const I1_ext = tile.I1 + 0.5;
      const J0_ext = tile.J0 - 0.5;
      const J1_ext = tile.J1 + 0.5;

      // Known NE and SW corners from original tile
      const ne = tile.corners[0]; // NE (I0, J0)
      const sw = tile.corners[2]; // SW (I1, J1)

      // Calculate new corners for the extended tile
      // Extended corners: NE, NW, SW, SE
      const ext_ne = this.calculateMissingCorner(ne, sw, I0_ext, J0_ext, tile.I0, tile.J0, tile.I1, tile.J1, proj);
      const ext_nw = this.calculateMissingCorner(ne, sw, I0_ext, J1_ext, tile.I0, tile.J0, tile.I1, tile.J1, proj);
      const ext_sw = this.calculateMissingCorner(ne, sw, I1_ext, J1_ext, tile.I0, tile.J0, tile.I1, tile.J1, proj);
      const ext_se = this.calculateMissingCorner(ne, sw, I1_ext, J0_ext, tile.I0, tile.J0, tile.I1, tile.J1, proj);

      return {
        ...tile,
        I0_ext,
        I1_ext,
        J0_ext,
        J1_ext,
        extended_corners: [
          { lat: ext_ne.lat, lon: ext_ne.lon }, // NE
          { lat: ext_nw.lat, lon: ext_nw.lon }, // NW
          { lat: ext_sw.lat, lon: ext_sw.lon }, // SW
          { lat: ext_se.lat, lon: ext_se.lon }, // SE
        ],
      };
    });
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

    // Ensure projection is initialized
    // if (proj.polei === -999.9) {
    //   this.llijLc(proj.lat1, proj.lon1, proj);
    // }

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

    proj.polei = -proj.hemi * rm_known * Math.sin(arg_known);
    proj.polej = rm_known * Math.cos(arg_known);

    if (proj.stdlon < -180.0) {
      proj.stdlon += 360.0;
    }

    if (proj.stdlon > 180.0) {
      proj.stdlon -= 360.0;
    }

    return proj;
  }
}
