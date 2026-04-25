/**
 * DomainProjectionConfig
 *
 * Reads domain_projection.csv at startup and initialises one LccProjection
 * per WRF domain. Any service that needs to convert lat/lon to i/j simply
 * injects this class and calls getProjection(domainName).
 *
 * Expected CSV location: src/util/domain_projection.csv
 *
 * Required CSV columns (order does not matter):
 *   domain    — e.g. d02, d03, d04, d05, d06
 *   lat1      — SW corner latitude,  degrees N
 *   lon1      — SW corner longitude, degrees E (-180..180)
 *   dx        — grid spacing, metres
 *   stdlon    — standard longitude parallel to the y-axis
 *   truelat1  — first true latitude, degrees N (> 0 for NH)
 *   truelat2  — second true latitude, degrees N (> 0 for NH)
 *   knowni    — i-index of the SW corner (always 1.0)
 *   knownj    — j-index of the SW corner (always 1.0)
 */

import * as fs   from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LccProjection, initLccProjection } from './lcc_projection';

/** The four high-resolution domain names */
export const HIGH_RES_DOMAINS = ['d03', 'd04', 'd05', 'd06'] as const;
export type  HighResDomain    = typeof HIGH_RES_DOMAINS[number];

/** The coarse-resolution domain name */
export const COARSE_DOMAIN = 'd02';

@Injectable()
export class DomainProjectionConfig implements OnModuleInit {
  private readonly logger = new Logger(DomainProjectionConfig.name);

  /** domain name → fully initialised LccProjection */
  private readonly projections = new Map<string, LccProjection>();

  /** Track whether CSV loaded successfully */
  private csvLoaded = false;

  onModuleInit(): void {
    // Wrap in try/catch so a CSV loading failure does not crash the entire
    // NestJS application. If loading fails, the AERMOD tab will return a
    // clear error message but the CALPUFF tab will still work normally.
    try {
      this.loadCsv();
      this.csvLoaded = true;
    } catch (error) {
      this.logger.error(
        `DomainProjectionConfig: failed to load domain_projection.csv. ` +
        `AERMOD tab will be unavailable. CALPUFF tab is unaffected. ` +
        `Error: ${error.message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CSV loading
  // ---------------------------------------------------------------------------
  private loadCsv(): void {
    const csvPath = path.join(process.cwd(), 'src', 'util', 'domain_projection.csv');

    this.logger.log(`DomainProjectionConfig: looking for CSV at ${csvPath}`);

    if (!fs.existsSync(csvPath)) {
      throw new Error(
        `File not found: ${csvPath}. ` +
        `Please ensure domain_projection.csv is in src/util/.`,
      );
    }

    const lines   = fs.readFileSync(csvPath, 'utf-8').split('\n');
    const headers = lines[0].trim().split(',').map(h => h.trim().toLowerCase());

    this.logger.log(`DomainProjectionConfig: CSV headers found: ${headers.join(', ')}`);

    // Build a column-index lookup so CSV column order does not matter
    const col = (name: string): number => {
      const idx = headers.indexOf(name);
      if (idx === -1) {
        throw new Error(
          `domain_projection.csv: required column "${name}" is missing. ` +
          `Available columns: ${headers.join(', ')}`,
        );
      }
      return idx;
    };

    const iDomain   = col('domain');
    const iLat1     = col('lat1');
    const iLon1     = col('lon1');
    const iDx       = col('dx');
    const iStdlon   = col('stdlon');
    const iTruelat1 = col('truelat1');
    const iTruelat2 = col('truelat2');
    const iKnowni   = col('knowni');
    const iKnownj   = col('knownj');

    for (let n = 1; n < lines.length; n++) {
      const line = lines[n].trim();
      if (!line) continue;

      const cols   = line.split(',');
      const domain = cols[iDomain].trim();

      try {
        const proj = initLccProjection({
          lat1:     parseFloat(cols[iLat1]),
          lon1:     parseFloat(cols[iLon1]),
          dx:       parseFloat(cols[iDx]),
          stdlon:   parseFloat(cols[iStdlon]),
          truelat1: parseFloat(cols[iTruelat1]),
          truelat2: parseFloat(cols[iTruelat2]),
          knowni:   parseFloat(cols[iKnowni]),
          knownj:   parseFloat(cols[iKnownj]),
        });

        this.projections.set(domain, proj);
        this.logger.log(
          `DomainProjectionConfig: loaded projection for ${domain}: ` +
          `lat1=${proj.lat1}, lon1=${proj.lon1}, dx=${proj.dx} m`,
        );
      } catch (error) {
        this.logger.error(
          `DomainProjectionConfig: failed to initialise projection for domain ` +
          `"${domain}" on line ${n + 1}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `DomainProjectionConfig: loaded ${this.projections.size} domain projection(s): ` +
      `${[...this.projections.keys()].join(', ')}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns the pre-initialised LccProjection for the given domain.
   * Throws a clear error if the domain name is not in the CSV or if the
   * CSV failed to load at startup.
   */
  getProjection(domain: string): LccProjection {
    if (!this.csvLoaded) {
      throw new Error(
        `DomainProjectionConfig: domain_projection.csv failed to load at startup. ` +
        `Cannot get projection for domain "${domain}". ` +
        `Please check that domain_projection.csv exists in src/util/.`,
      );
    }

    const proj = this.projections.get(domain);
    if (!proj) {
      throw new Error(
        `DomainProjectionConfig: unknown domain "${domain}". ` +
        `Available domains: ${[...this.projections.keys()].join(', ')}`,
      );
    }
    return proj;
  }

  /** Returns every loaded domain name */
  getDomainNames(): string[] {
    return [...this.projections.keys()];
  }

  /** True if the domain has a loaded projection */
  hasDomain(domain: string): boolean {
    return this.projections.has(domain);
  }

  /** True if the CSV loaded successfully */
  isLoaded(): boolean {
    return this.csvLoaded;
  }
}
