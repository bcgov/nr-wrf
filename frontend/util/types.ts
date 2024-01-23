export interface TileDownloadInfo {
  startYear: number;
  startMonth: number;
  startDay: number;
  startHour: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  endHour: number;
  timeZone: number;
  latitude: number;
  longitude: number;
  closestPoint: {
    i: number;
    j: number;
    lat: number;
    lon: number;
    tile_id: number;
    filename: string;
    full_url: string;
  };
}
