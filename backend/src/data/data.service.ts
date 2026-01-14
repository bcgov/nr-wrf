import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Tile structure matching the new CSV format
export interface Tile {
  filename: string;
  year: number;
  month?: number; // aermod doesn't use month values
  domain: string;
  tile: string;
  I0: number; // min I (west)
  J0: number; // min J (south)
  I1: number; // max I (east)
  J1: number; // max J (north)
  lat0: number; // south latitude
  lon0: number; // west longitude
  lat1: number; // north latitude
  lon1: number; // east longitude
  url: string;
}

// Result for a single domain
export interface DomainResult {
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

// Results grouped by domain
export interface CalculateVarsResult {
  byDomain: { [domain: string]: DomainResult };
}

let tiles: Tile[] = [];
let dataLoaded = false;

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor() {
    this.loadTileData();
  }

  private async loadTileData(): Promise<void> {
    try {
      // load calpuff tile data
      const csvPath = path.join(process.cwd(), 'src', 'util', 'calpuff_files.csv');
      const csv = fs.readFileSync(csvPath, 'utf-8');
      const lines = csv.split('\n');

      // skip header row (line 0)
      for (let n = 1; n < lines.length; n++) {
        const line = lines[n].trim();
        if (!line) continue;

        const cols = line.split(',');
        if (cols.length < 14) continue;

        tiles.push({
          filename: cols[0],
          year: parseInt(cols[1]),
          month: parseInt(cols[2]),
          domain: cols[3],
          tile: cols[4],
          I0: parseInt(cols[5]),
          J0: parseInt(cols[6]),
          I1: parseInt(cols[7]),
          J1: parseInt(cols[8]),
          lat0: parseFloat(cols[9]),
          lon0: parseFloat(cols[10]),
          lat1: parseFloat(cols[11]),
          lon1: parseFloat(cols[12]),
          url: cols[13],
        });
      }

      dataLoaded = true;
      this.logger.log(`Loaded ${tiles.length} tiles from CSV`);
      this.getDomainRanges();
    } catch (error) {
      this.logger.error('Failed to load tile data', error);
    }
  }

  /**
   * Find the min/max I and J values for tiles that overlap with the selected bounding box.
   * Results are grouped by domain since each domain has its own I/J grid system.
   *
   * Domain info:
   * - d02: Low resolution domain covering the entire area
   * - d03, d04, d05, d06: High resolution domains covering smaller specific areas
   *
   * @param southLat (bottomLeftYGlobal)
   * @param northLat (topRightYGlobal)
   * @param westLon (bottomLeftXGlobal)
   * @param eastLon (topRightXGlobal)
   */
  async calculateVars(
    southLat: number,
    northLat: number,
    westLon: number,
    eastLon: number
  ): Promise<CalculateVarsResult> {
    if (!dataLoaded) {
      await this.waitForData();
    }

    // group results by domain
    const byDomain: { [domain: string]: DomainResult } = {};
    const seenTiles = new Set<string>(); // track unique tiles by domain+I0+J0+I1+J1

    for (const tile of tiles) {
      // check if bounding box overlaps with this tile's bounding box
      const overlapsLat = southLat < tile.lat1 && northLat > tile.lat0;
      const overlapsLon = westLon < tile.lon1 && eastLon > tile.lon0;

      if (overlapsLat && overlapsLon) {
        // unique key for tile geometry (ignore year/month for I/J calculation)
        const tileKey = `${tile.domain}-${tile.I0}-${tile.J0}-${tile.I1}-${tile.J1}`;
        if (seenTiles.has(tileKey)) continue;
        seenTiles.add(tileKey);

        // create domain in byDomain if it doesn't exist yet
        if (!byDomain[tile.domain]) {
          byDomain[tile.domain] = {
            minI: Infinity,
            maxI: -Infinity,
            minJ: Infinity,
            maxJ: -Infinity,
          };
        }

        // Update domain-specific I/J ranges
        const domainResult = byDomain[tile.domain];
        domainResult.minI = Math.min(domainResult.minI, tile.I0);
        domainResult.maxI = Math.max(domainResult.maxI, tile.I1);
        domainResult.minJ = Math.min(domainResult.minJ, tile.J0);
        domainResult.maxJ = Math.max(domainResult.maxJ, tile.J1);
      }
    }

    // debug logging
    // for (const [domain, result] of Object.entries(byDomain)) {
    //   this.logger.log(
    //     `Domain ${domain}: I range: ${result.minI}-${result.maxI}, J range: ${result.minJ}-${result.maxJ}`
    //   );
    // }

    return { byDomain };
  }

  /**
   * Scan the CSV to find the I/J ranges for each domain.
   * This is used to set the m3d_bild I/J ranges in each domain file
   */
  getDomainRanges(): {
    [domain: string]: { minI: number; maxI: number; minJ: number; maxJ: number; tileCount: number };
  } {
    const ranges: { [domain: string]: { minI: number; maxI: number; minJ: number; maxJ: number; tileCount: number } } =
      {};
    const seenTiles = new Set<string>();

    for (const tile of tiles) {
      // track unique tiles by domain + coordinates (ignore year/month)
      const tileKey = `${tile.domain}-${tile.I0}-${tile.J0}-${tile.I1}-${tile.J1}`;
      if (seenTiles.has(tileKey)) continue;
      seenTiles.add(tileKey);

      if (!ranges[tile.domain]) {
        ranges[tile.domain] = {
          minI: Infinity,
          maxI: -Infinity,
          minJ: Infinity,
          maxJ: -Infinity,
          tileCount: 0,
        };
      }

      const r = ranges[tile.domain];
      r.minI = Math.min(r.minI, tile.I0);
      r.maxI = Math.max(r.maxI, tile.I1);
      r.minJ = Math.min(r.minJ, tile.J0);
      r.maxJ = Math.max(r.maxJ, tile.J1);
      r.tileCount++;
    }

    // debug logs
    // for (const [domain, r] of Object.entries(ranges)) {
    //   this.logger.log(
    //     `Domain ${domain}: I range: ${r.minI}-${r.maxI}, J range: ${r.minJ}-${r.maxJ}, unique tiles: ${r.tileCount}`
    //   );
    // }

    return ranges;
  }

  private waitForData(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (dataLoaded) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
}
