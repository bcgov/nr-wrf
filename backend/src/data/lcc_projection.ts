/**
 * Lambert Conformal Conic (LCC) Projection Utilities — Northern Hemisphere Only
 *
 * Translated from Fortran module_llxy.f90 (WRF/MMIF)
 * Converts geographic lat/lon coordinates to grid i/j indices (decimal).
 *
 * Assumptions (Northern Hemisphere):
 *   - hemi is fixed at +1.0
 *   - truelat1 and truelat2 must both be positive (> 0)
 *   - Grid origin (1,1) is at the SW corner
 *   - Grid spacing dx is positive, in metres
 *
 * Usage:
 *   1. Call `initLccProjection(...)` once with your domain's projection parameters.
 *   2. Call `lccLatLonToIJ(proj, lat, lon)` to get decimal i/j indices.
 *   3. Optionally call `lccBoundingBoxToIJ(proj, south, north, west, east)` for a full box.
 */

// ---------------------------------------------------------------------------
// Constants (from module_llxy.f90)
// ---------------------------------------------------------------------------
const PI           = 3.141592653589793;
const DEG_PER_RAD  = 180.0 / PI;
const RAD_PER_DEG  = PI / 180.0;
const EARTH_RADIUS = 6370000.0; // metres — WRF uses a spherical earth for LCC

// Northern hemisphere: hemi is always +1
const HEMI = 1.0;

// ---------------------------------------------------------------------------
// Projection parameter structure
// Mirrors the Fortran TYPE(proj_info) fields used by the LCC routines.
// ---------------------------------------------------------------------------
export interface LccProjection {
  /** Latitude of SW corner of grid cell (1,1), degrees N — must be > 0 */
  lat1: number;
  /** Longitude of SW corner of grid cell (1,1), degrees E (-180..180) */
  lon1: number;
  /** Known i-index at (lat1, lon1) — typically 1.0 */
  knowni: number;
  /** Known j-index at (lat1, lon1) — typically 1.0 */
  knownj: number;
  /** Grid spacing in metres — must be > 0 */
  dx: number;
  /** Standard longitude parallel to the y-axis, degrees E (-180..180) */
  stdlon: number;
  /** First true latitude, degrees N — must be > 0 */
  truelat1: number;
  /** Second true latitude, degrees N — must be > 0; set equal to truelat1 for tangent LCC */
  truelat2: number;

  // --- precomputed by initLccProjection, do not set manually ---
  /** Cone factor (computed from truelat1, truelat2) */
  cone: number;
  /** Earth radius / dx */
  rebydx: number;
  /** Computed i-location of the north pole in grid coordinates */
  polei: number;
  /** Computed j-location of the north pole in grid coordinates */
  polej: number;
}

// ---------------------------------------------------------------------------
// Step 1 — Compute the cone factor
// Mirrors Fortran subroutine lc_cone()
//
// For a secant LCC (truelat1 != truelat2):
//   cone = log10(cos(φ1)) - log10(cos(φ2))
//          ─────────────────────────────────────────────
//          log10(tan(45 - φ1/2)) - log10(tan(45 - φ2/2))
//
// For a tangent LCC (truelat1 == truelat2):
//   cone = sin(φ1)
//
// NOTE: In the NH, ABS() around truelat values is unnecessary since
// both are guaranteed positive. The abs() calls from the original
// Fortran are removed for clarity.
// ---------------------------------------------------------------------------
function computeCone(truelat1: number, truelat2: number): number {
  if (Math.abs(truelat1 - truelat2) > 0.1) {
    // Secant projection — two distinct standard parallels
    return (
      (Math.log10(Math.cos(truelat1 * RAD_PER_DEG)) -
        Math.log10(Math.cos(truelat2 * RAD_PER_DEG))) /
      (Math.log10(Math.tan((45.0 - truelat1 / 2.0) * RAD_PER_DEG)) -
        Math.log10(Math.tan((45.0 - truelat2 / 2.0) * RAD_PER_DEG)))
    );
  } else {
    // Tangent projection — cone touches the sphere at one latitude
    return Math.sin(truelat1 * RAD_PER_DEG);
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Initialise the projection
// Mirrors Fortran subroutine set_lc() with hemi = +1 throughout.
//
// Precomputes:
//   cone   — the LCC cone factor
//   rebydx — earth radius / grid spacing (converts metres to grid units)
//   rsw    — radius from north pole to the SW corner (grid units)
//   polei  — i-index of the north pole in grid space
//   polej  — j-index of the north pole in grid space
// ---------------------------------------------------------------------------
export function initLccProjection(params: {
  lat1: number;
  lon1: number;
  knowni: number;
  knownj: number;
  dx: number;
  stdlon: number;
  truelat1: number;
  truelat2: number;
}): LccProjection {
  const { lat1, lon1, knowni, knownj, dx, stdlon, truelat1, truelat2 } = params;

  // --- NH-only input validation ---
  if (truelat1 <= 0 || truelat2 <= 0) {
    throw new Error(
      `initLccProjection (NH only): truelat1 and truelat2 must both be > 0. ` +
      `Got truelat1=${truelat1}, truelat2=${truelat2}.`
    );
  }
  if (lat1 <= 0) {
    throw new Error(
      `initLccProjection (NH only): lat1 must be > 0. Got lat1=${lat1}.`
    );
  }
  if (dx <= 0) {
    throw new Error(`initLccProjection: dx must be positive. Got dx=${dx}.`);
  }

  // Cone factor
  const cone = computeCone(truelat1, truelat2);

  // Earth radius / grid spacing
  const rebydx = EARTH_RADIUS / dx;

  // cos(truelat1) — used in the radius formula
  const ctl1r = Math.cos(truelat1 * RAD_PER_DEG);

  // Longitude difference between the SW corner (lon1) and the standard
  // longitude, clamped to (-180, +180] to avoid the "cut zone"
  let deltalon1 = lon1 - stdlon;
  if (deltalon1 >  180.0) deltalon1 -= 360.0;
  if (deltalon1 < -180.0) deltalon1 += 360.0;

  // Radius from the north pole to the SW corner (grid units).
  // With hemi=1: (90*hemi - lat) simplifies to (90 - lat).
  //
  // Fortran: rsw = rebydx * ctl1r/cone
  //               * ( TAN((90-lat1)*RAD/2) / TAN((90-tl1)*RAD/2) ) ^ cone
  const rsw =
    rebydx *
    (ctl1r / cone) *
    Math.pow(
      Math.tan(((90.0 - lat1)     * RAD_PER_DEG) / 2.0) /
      Math.tan(((90.0 - truelat1) * RAD_PER_DEG) / 2.0),
      cone
    );

  // Angle between the standard longitude and the SW corner (radians)
  const arg = cone * (deltalon1 * RAD_PER_DEG);

  // Pole location in grid coordinates.
  // Fortran (hemi=1): polei = hemi*knowni - hemi*rsw*SIN(arg)  =>  knowni - rsw*SIN(arg)
  //                   polej = hemi*knownj + rsw*COS(arg)        =>  knownj + rsw*COS(arg)
  const polei = knowni - rsw * Math.sin(arg);
  const polej = knownj + rsw * Math.cos(arg);

  return {
    lat1, lon1, knowni, knownj, dx, stdlon, truelat1, truelat2,
    cone, rebydx, polei, polej,
  };
}

// ---------------------------------------------------------------------------
// Step 3 — Convert a single lat/lon point to decimal i/j
// Mirrors Fortran subroutine llij_lc() with hemi = +1 throughout.
//
// Core idea:
//   1. Compute rm — the radius (in grid units) from the north pole to
//      the target point, using the LCC conformal cone formula.
//   2. Compute arg — the angular sweep from the standard longitude to
//      the target longitude, scaled by the cone factor.
//   3. Project rm and arg onto the flat grid using sin/cos.
//   4. With hemi=1 the final hemisphere flip is i=i, j=j (no-op).
// ---------------------------------------------------------------------------
export function lccLatLonToIJ(
  proj: LccProjection,
  lat: number,
  lon: number
): { i: number; j: number } {
  const { cone, rebydx, truelat1, stdlon, polei, polej } = proj;

  // Longitude difference from standard longitude, clamped to (-180, +180]
  let deltalon = lon - stdlon;
  if (deltalon >  180.0) deltalon -= 360.0;
  if (deltalon < -180.0) deltalon += 360.0;

  // cos(truelat1)
  const ctl1r = Math.cos(truelat1 * RAD_PER_DEG);

  // Radius from the north pole to the target point (grid units).
  // With hemi=1: (90 - lat) is always positive for NH latitudes.
  //
  // Fortran: rm = rebydx * ctl1r/cone
  //               * ( TAN((90-lat)*RAD/2) / TAN((90-tl1)*RAD/2) ) ^ cone
  const rm =
    rebydx *
    (ctl1r / cone) *
    Math.pow(
      Math.tan(((90.0 - lat)     * RAD_PER_DEG) / 2.0) /
      Math.tan(((90.0 - truelat1) * RAD_PER_DEG) / 2.0),
      cone
    );

  // Angular offset from the standard longitude (radians)
  const arg = cone * (deltalon * RAD_PER_DEG);

  // Grid position.
  // Fortran (hemi=1): i = polei + hemi*rm*SIN(arg)  =>  polei + rm*SIN(arg)
  //                   j = polej - rm*COS(arg)
  // The final hemisphere flip (i = hemi*i, j = hemi*j) is a no-op for hemi=1.
  const i = polei + rm * Math.sin(arg);
  const j = polej - rm * Math.cos(arg);

  return { i, j };
}

// ---------------------------------------------------------------------------
// Convenience: convert all four corners of a bounding box to min/max i/j
//
// On a curved LCC grid the extremes are not always exactly at the NE/SW
// corners (meridians converge toward the pole), so all four corners are
// evaluated and the overall min/max is returned.
// ---------------------------------------------------------------------------
export function lccBoundingBoxToIJ(
  proj: LccProjection,
  southLat: number,
  northLat: number,
  westLon: number,
  eastLon: number
): {
  swI: number; swJ: number;
  neI: number; neJ: number;
  minI: number; maxI: number;
  minJ: number; maxJ: number;
} {
  const sw = lccLatLonToIJ(proj, southLat, westLon);
  const se = lccLatLonToIJ(proj, southLat, eastLon);
  const nw = lccLatLonToIJ(proj, northLat, westLon);
  const ne = lccLatLonToIJ(proj, northLat, eastLon);

  return {
    swI: sw.i, swJ: sw.j,
    neI: ne.i, neJ: ne.j,
    minI: Math.min(sw.i, se.i, nw.i, ne.i),
    maxI: Math.max(sw.i, se.i, nw.i, ne.i),
    minJ: Math.min(sw.j, se.j, nw.j, ne.j),
    maxJ: Math.max(sw.j, se.j, nw.j, ne.j),
  };
}
