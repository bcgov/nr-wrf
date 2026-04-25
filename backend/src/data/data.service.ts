import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

import { lccLatLonToIJ }                                            from './lcc_projection';
import { DomainProjectionConfig, HIGH_RES_DOMAINS, COARSE_DOMAIN } from './domain-projection.config';

// =============================================================================
// TAB 1 — CALPUFF
// Uses calpuff_files.csv.
// Tile lookup is based on lat/lon bounding box overlap against each tile's
// lat0/lat1/lon0/lon1 geographic extents. No LCC projection is used.
// The original algorithm is kept completely unchanged.
// =============================================================================

export interface Tile {
  filename: string;
  year: number;
  month?: number;
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

export interface DomainResult {
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

export interface CalculateVarsResult {
  domain: string;
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

// =============================================================================
// TAB 2 — AERMOD
// Uses aermod_files.csv.
// When a user enters a lat/lon, the app:
//   1. Converts lat/lon to decimal i/j using the LCC projection for each domain.
//   2. Floors the decimal i/j to the nearest integer mass-point (SW-corner
//      convention): 80.3→80, 80.5→80, 81.0→81
//   3. Finds the one tile whose I0/J0/I1/J1 range contains the floored i/j.
//   4. Always returns the matching coarse d02 tile.
//   5. Also returns the matching high-res tile (d03–d06) if the location falls
//      within one of those domains. A location can be in at most one high-res
//      domain at a time.
// =============================================================================

export interface AermodTile {
  filename: string;
  tile: number;
  domain: string;
  year: number;
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

export interface AermodTileResult {
  domain: string;
  tiles: number[];
}

// =============================================================================
// Module-level caches
// =============================================================================
let tiles: Tile[] = [];
let dataLoaded = false;

type AermodTileIndex = Map<string, Map<number, AermodTile>>;
let aermodTileIndex: AermodTileIndex = new Map();
let aermodDataLoaded = false;

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  private domainExtents: {
    [domain: string]: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    };
  } = {};

  constructor(private readonly domainConfig: DomainProjectionConfig) {
    this.loadTileData();
    this.loadAermodTiles();
  }

  // ===========================================================================
  // CALPUFF — load calpuff_files.csv
  // ===========================================================================
  private async loadTileData(): Promise<void> {
    try {
      const csvPath = path.join(process.cwd(), 'src', 'util', 'calpuff_files.csv');
      this.logger.log(`DataService: loading CALPUFF tiles from ${csvPath}`);

      const csv = fs.readFileSync(csvPath, 'utf-8');
      const lines = csv.split('\n');

      for (let n = 1; n < lines.length; n++) {
        const line = lines[n].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length < 14) continue;

        tiles.push({
          filename: cols[0],
          year:     parseInt(cols[1]),
          month:    parseInt(cols[2]),
          domain:   cols[3],
          tile:     cols[4],
          I0:       parseInt(cols[5]),
          J0:       parseInt(cols[6]),
          I1:       parseInt(cols[7]),
          J1:       parseInt(cols[8]),
          lat0:     parseFloat(cols[9]),
          lon0:     parseFloat(cols[10]),
          lat1:     parseFloat(cols[11]),
          lon1:     parseFloat(cols[12]),
          url:      cols[13],
        });
      }

      for (const tile of tiles) {
        if (!this.domainExtents[tile.domain]) {
          this.domainExtents[tile.domain] = {
            minLat: Infinity,
            maxLat: -Infinity,
            minLon: Infinity,
            maxLon: -Infinity,
          };
        }
        const ext = this.domainExtents[tile.domain];
        ext.minLat = Math.min(ext.minLat, tile.lat0);
        ext.maxLat = Math.max(ext.maxLat, tile.lat1);
        ext.minLon = Math.min(ext.minLon, tile.lon0);
        ext.maxLon = Math.max(ext.maxLon, tile.lon1);
      }

      dataLoaded = true;
      this.logger.log(`DataService: loaded ${tiles.length} CALPUFF tiles`);
      this.getDomainRanges();
    } catch (error) {
      this.logger.error(`DataService: failed to load calpuff_files.csv: ${error.message}`);
    }
  }

  // ===========================================================================
  // AERMOD — load aermod_files.csv
  // ===========================================================================
  private async loadAermodTiles(): Promise<void> {
    try {
      const csvPath = path.join(process.cwd(), 'src', 'util', 'aermod_files.csv');
      this.logger.log(`DataService: loading AERMOD tiles from ${csvPath}`);

      const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');

      const headers = lines[0].trim().split(',').map(h => h.trim().toLowerCase());
      this.logger.log(`DataService: AERMOD CSV headers: ${headers.join(', ')}`);

      const col = (name: string): number => {
        const idx = headers.indexOf(name);
        if (idx === -1) throw new Error(`aermod_files.csv: missing column "${name}"`);
        return idx;
      };

      const iFilename = col('filename');
      const iTile     = col('tile');
      const iDomain   = col('domain');
      const iYear     = col('year');
      const iI0 = col('i0'); const iJ0 = col('j0');
      const iI1 = col('i1'); const iJ1 = col('j1');
      const iLat0 = col('lat0'); const iLon0 = col('lon0');
      const iLat1 = col('lat1'); const iLon1 = col('lon1');
      const iUrl  = col('url');

      let uniqueCount = 0;

      for (let n = 1; n < lines.length; n++) {
        const line = lines[n].trim();
        if (!line) continue;
        const c = line.split(',');
        if (c.length < 13) continue;

        const domain = c[iDomain];
        const tileId = parseInt(c[iTile]);

        if (!aermodTileIndex.has(domain)) {
          aermodTileIndex.set(domain, new Map<number, AermodTile>());
        }

        const bucket = aermodTileIndex.get(domain)!;
        if (!bucket.has(tileId)) {
          bucket.set(tileId, {
            filename: c[iFilename],
            tile:     tileId,
            domain,
            year:     parseInt(c[iYear]),
            I0:       parseInt(c[iI0]),
            J0:       parseInt(c[iJ0]),
            I1:       parseInt(c[iI1]),
            J1:       parseInt(c[iJ1]),
            lat0:     parseFloat(c[iLat0]),
            lon0:     parseFloat(c[iLon0]),
            lat1:     parseFloat(c[iLat1]),
            lon1:     parseFloat(c[iLon1]),
            url:      c[iUrl],
          });
          uniqueCount++;
        }
      }

      aermodDataLoaded = true;
      this.logger.log(
        `DataService: loaded ${uniqueCount} unique AERMOD tiles: ` +
        `${[...aermodTileIndex.entries()].map(([d, m]) => `${d}:${m.size}`).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(`DataService: failed to load aermod_files.csv: ${error.message}`);
    }
  }

  // ===========================================================================
  // Wait helpers
  // ===========================================================================
  private waitForData(): Promise<void> {
    return new Promise(resolve => {
      const t = setInterval(() => {
        if (dataLoaded) { clearInterval(t); resolve(); }
      }, 100);
    });
  }

  private waitForAermod(): Promise<void> {
    return new Promise(resolve => {
      const t = setInterval(() => {
        if (aermodDataLoaded) { clearInterval(t); resolve(); }
      }, 100);
    });
  }

  // ===========================================================================
  // TAB 1 — CALPUFF: calculateVars (original algorithm — unchanged)
  // ===========================================================================
  async calculateVars(
    southLat: number,
    northLat: number,
    westLon: number,
    eastLon: number,
  ): Promise<CalculateVarsResult> {
    if (!dataLoaded) await this.waitForData();

    console.log(`southLat: ${southLat}`);
    console.log(`northLat: ${northLat}`);
    console.log(`westLon: ${westLon}`);
    console.log(`eastLon: ${eastLon}`);

    const byDomain: { [domain: string]: DomainResult } = {};
    const seenTiles = new Set<string>();

    for (const tile of tiles) {
      const overlapsLat = southLat < tile.lat1 && northLat > tile.lat0;
      const overlapsLon = westLon < tile.lon1 && eastLon > tile.lon0;

      if (overlapsLat && overlapsLon) {
        const tileKey = `${tile.domain}-${tile.I0}-${tile.J0}-${tile.I1}-${tile.J1}`;
        if (seenTiles.has(tileKey)) continue;
        seenTiles.add(tileKey);

        if (!byDomain[tile.domain]) {
          byDomain[tile.domain] = {
            minI: Infinity,
            maxI: -Infinity,
            minJ: Infinity,
            maxJ: -Infinity,
          };
        }

        const domainResult = byDomain[tile.domain];
        domainResult.minI = Math.min(domainResult.minI, tile.I0);
        domainResult.maxI = Math.max(domainResult.maxI, tile.I1);
        domainResult.minJ = Math.min(domainResult.minJ, tile.J0);
        domainResult.maxJ = Math.max(domainResult.maxJ, tile.J1);
        console.log('domainResult');
        console.log(domainResult);
      }
    }

    const highResDomains = ['d03', 'd04', 'd05', 'd06'];
    for (const domain of highResDomains) {
      const ext = this.domainExtents[domain];
      if (
        ext &&
        southLat >= ext.minLat &&
        northLat <= ext.maxLat &&
        westLon >= ext.minLon &&
        eastLon <= ext.maxLon
      ) {
        const res = byDomain[domain];
        if (res) {
          console.log({ domain, minI: res.minI, maxI: res.maxI, minJ: res.minJ, maxJ: res.maxJ });
          return { domain, minI: res.minI, maxI: res.maxI, minJ: res.minJ, maxJ: res.maxJ };
        }
      }
    }

    const res = byDomain['d02'];
    if (res) {
      console.log({ domain: 'd02', minI: res.minI, maxI: res.maxI, minJ: res.minJ, maxJ: res.maxJ });
      return { domain: 'd02', minI: res.minI, maxI: res.maxI, minJ: res.minJ, maxJ: res.maxJ };
    }

    throw new Error('No d02 domain data found');
  }

  // ===========================================================================
  // TAB 1 — CALPUFF: getDomainRanges (original — unchanged)
  // ===========================================================================
  getDomainRanges(): {
    [domain: string]: {
      minI: number;
      maxI: number;
      minJ: number;
      maxJ: number;
      tileCount: number;
    };
  } {
    const ranges: {
      [domain: string]: {
        minI: number;
        maxI: number;
        minJ: number;
        maxJ: number;
        tileCount: number;
      };
    } = {};
    const seenTiles = new Set<string>();

    for (const tile of tiles) {
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

    return ranges;
  }

  // ===========================================================================
  // TAB 2 — AERMOD: findAermodTilesAtPoint
  //
  // Given a lat/lon point:
  //   1. Converts to decimal i/j using LCC projection for each domain.
  //   2. Floors decimal i/j to nearest integer mass-point (SW-corner convention).
  //   3. Finds the tile containing that point.
  //   4. Always returns d02 tile. Returns high-res tile if point is within one.
  // ===========================================================================
  async findAermodTilesAtPoint(
    lat: number,
    lon: number,
  ): Promise<AermodTileResult[]> {
    if (!aermodDataLoaded) await this.waitForAermod();

    this.logger.log(`findAermodTilesAtPoint called with lat=${lat}, lon=${lon}`);
    this.logger.log(`DomainProjectionConfig loaded: ${this.domainConfig.isLoaded()}`);
    this.logger.log(`Available domains: ${this.domainConfig.getDomainNames().join(', ')}`);

    try {
      const result: AermodTileResult[] = [];

      // Step 1: always find the d02 (coarse) tile
      this.logger.log(`Getting d02 projection...`);
      const d02Proj = this.domainConfig.getProjection(COARSE_DOMAIN);

      this.logger.log(`Converting lat/lon to i/j for d02...`);
      const d02IJ = lccLatLonToIJ(d02Proj, lat, lon);
      this.logger.log(`d02 i/j: ${d02IJ.i}, ${d02IJ.j}`);

      const d02Tile = this.findTileContainingPoint(COARSE_DOMAIN, d02IJ.i, d02IJ.j);

      if (!d02Tile) {
        throw new Error(
          `lat=${lat}, lon=${lon} is outside all d02 tiles. ` +
          `Please check that the coordinates are within BC.`,
        );
      }

      this.logger.log(`d02 tile found: ${d02Tile.tile}`);
      result.push({ domain: COARSE_DOMAIN, tiles: [d02Tile.tile] });

      // Step 2: check each high-res domain
      for (const domain of HIGH_RES_DOMAINS) {
        if (!this.domainConfig.hasDomain(domain)) {
          this.logger.log(`Domain ${domain} not available — skipping`);
          continue;
        }

        const proj = this.domainConfig.getProjection(domain);
        const ij   = lccLatLonToIJ(proj, lat, lon);
        this.logger.log(`${domain} i/j: ${ij.i}, ${ij.j}`);

        const tile = this.findTileContainingPoint(domain, ij.i, ij.j);

        if (tile) {
          this.logger.log(`${domain} tile found: ${tile.tile}`);
          result.push({ domain, tiles: [tile.tile] });
          break;
        } else {
          this.logger.log(`Point is outside ${domain} coverage area`);
        }
      }

      this.logger.log(`findAermodTilesAtPoint result: ${JSON.stringify(result)}`);
      return result;

    } catch (error) {
      this.logger.error(`findAermodTilesAtPoint failed: ${error.message}`);
      throw error;
    }
  }

  // ===========================================================================
  // Private helper — find the AERMOD tile containing a decimal i/j point.
  //
  // Uses Math.floor (SW-corner convention):
  //   80.3→80, 80.5→80, 81.0→81
  //
  // Returns null if the point is outside this domain's coverage.
  // ===========================================================================
  private findTileContainingPoint(
    domain: string,
    i: number,
    j: number,
  ): AermodTile | null {
    const bucket = aermodTileIndex.get(domain);
    if (!bucket) {
      this.logger.warn(`findTileContainingPoint: no tiles found for domain "${domain}"`);
      return null;
    }

    const iInt = Math.floor(i);
    const jInt = Math.floor(j);

    this.logger.log(
      `findTileContainingPoint: domain=${domain}, ` +
      `i=${i}→${iInt}, j=${j}→${jInt}, ` +
      `searching ${bucket.size} tiles`,
    );

    for (const tile of bucket.values()) {
      if (iInt >= tile.I0 && iInt <= tile.I1 && jInt >= tile.J0 && jInt <= tile.J1) {
        return tile;
      }
    }
    return null;
  }
}
