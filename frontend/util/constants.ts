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
  stdlon: number;
  /// First true latitude (all projections)
  truelat1: number;
  /// Second true lat (LC only)
  truelat2: number;
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
