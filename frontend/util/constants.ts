export class ProjInfo {
  /// Integer code for projection TYPE
  code: number;
  /// SW latitude(1,1) in degrees(-90->90N)
  lat1: number;
  /// //SW longitude (1,1) in degrees (-180->180E)
  lon1: number;
  /// Grid spacing in meters at truelats, used only for ps, lc, and merc projections
  dx: number;
  /// Grid spacing in meters at truelats, used only for ps, lc, and merc projections
  dy: number;
  /// Latitude increment for cylindrical lat/lon
  latinc: number = -999.9;
  /// Longitude increment for cylindrical lat/lon also the lon increment for Gaussian grid
  loninc: number = -999.9;
  /// Lat increment for lat/lon grids
  dlat: number = -999.9;
  /// Lon increment for lat/lon grids
  dlon: number = -999.9;
  /// Longitude parallel to y-axis (-180->180E)
  stdlon: number = -120.87899780273438;
  /// First true latitude (all projections)
  truelat1: number = 55.15700149356133;
  /// Second true lat (LC only)
  truelat2: number = 55.15700149356133;
  /// 1 for NH, -1 for SH
  hemi: number = 1; //1 for NH, -1 for SH
  /// Cone factor for LC projections
  cone: number;
  /// Computed i-location of pole point
  polei: number = -999.9;
  ///  Computed j-location of pole point
  polej: number = -999.9;
  /// Computed radius to SW corner
  rsw: number = -999.9;
  /// Earth radius divided by dx
  rebydx: number;
  /// X-location of known lat/lon
  knowni: number = 1.0;
  /// Y-location of known lat/lon
  knownj: number = 1.0;
  /// Radius of spherical earth, meters
  re_m: number = 6370000.0; // Radius of spherical earth, meters

  constructor() {}
}

/**
 * WRF domain configuration for the AERMOD tile grids.
 * Source: WRF domain definition (domain_llcrns.xlsx).
 *
 * - dx: grid spacing in meters (d02 = 4 km; d03-d06 = 4/3 km high resolution).
 * - llcrnLat / llcrnLon: the domain's lower-left corner mass point, i.e. the
 *   lat/lon of grid point (1, 1). This anchors the domain's Lambert projection.
 *
 * IMPORTANT: an anchor is a four-number fact - (lat, lon) and the grid indices
 * (knowni, knownj) of the SAME physical point. These values pair with
 * knowni = knownj = 1. If the anchor point is ever changed to a different mass
 * point, its grid indices must change with it; updating either half alone
 * shifts the entire grid.
 *
 * All domains share the parent projection (ProjInfo defaults: stdlon,
 * truelat1/truelat2); only dx (i.e., grid spacing) and the anchor differ per domain.
 *
 * If the WRF domains are re-run, update dx and anchors here, then re-validate:
 * projecting every tile corner mass point in aermod_files.csv must reproduce
 * its I/J indices to within ~0.01 grid cells.
 */
export const WRF_DOMAINS: { [domain: string]: { dx: number; llcrnLat: number; llcrnLon: number } } = {
  d02: { dx: 4000.0, llcrnLat: 47.07421875, llcrnLon: -134.49696350097599 },
  d03: { dx: 4000.0 / 3.0, llcrnLat: 53.425212860107401, llcrnLon: -129.46455383300699 },
  d04: { dx: 4000.0 / 3.0, llcrnLat: 53.3097114562988, llcrnLon: -123.702377319335 },
  d05: { dx: 4000.0 / 3.0, llcrnLat: 48.7634468078613, llcrnLon: -118.64852905273401 },
  d06: { dx: 4000.0 / 3.0, llcrnLat: 48.785228729247997, llcrnLon: -123.697021484375 },
};
