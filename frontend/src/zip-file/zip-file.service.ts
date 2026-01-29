import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, map } from 'rxjs';
import * as uuid from 'uuid';
import { downloadFile, zipFiles } from '../../util/util';
import { TileDownloadInfo } from '../../util/types';
import { Cron } from '@nestjs/schedule';
import { MappingService } from '../mapping/mapping.service';
const fs = require('fs');

let hostname: string;
let port: number;

interface CalpuffFileRecord {
  filename: string;
  year: number;
  month: number;
  domain: string;
  tileId: string;
  i0: number;
  j0: number;
  i1: number;
  j1: number;
  lat0: number;
  lon0: number;
  lat1: number;
  lon1: number;
  url: string;
}

@Injectable()
export class ZipFileService {
  constructor(private httpService: HttpService, private mappingService: MappingService) {
    // docker hostname is the container name, use localhost for local development
    hostname = process.env.BACKEND_URL ? process.env.BACKEND_URL : `http://localhost`;
    // local development backend port is 3001, docker backend port is 3000
    // port = process.env.BACKEND_URL ? 3000 : 3001;
    port = 3000; // frontend = 8080, backend = 3000 for now
  }

  private calpuffIndex: CalpuffFileRecord[] | null = null;

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

  /**
   * CALPUFF function that starts download/zipping files
   */
  async beginZippingFromBounds(request: {
    bottomLeftYGlobal: number;
    topRightYGlobal: number;
    bottomLeftXGlobal: number;
    topRightXGlobal: number;
    timezoneOffsetHours: number;
    startDateIso: string;
    endDateIso: string;
  }): Promise<{ subFolder: string }> {
    // still used for some support files
    const baseUrl = 'https://nrs.objectstore.gov.bc.ca/kadkvt/';

    const { bottomLeftYGlobal, topRightYGlobal, bottomLeftXGlobal, topRightXGlobal, startDateIso, endDateIso } =
      request;

    const { domain, minI, maxI, minJ, maxJ } = await this.calculateVars(
      bottomLeftYGlobal,
      topRightYGlobal,
      bottomLeftXGlobal,
      topRightXGlobal
    );

    const startDate = new Date(startDateIso);
    const endDate = new Date(endDateIso);

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;
    const urls: string[] = this.lookupCalpuffUrls(
      domain,
      startYear,
      startMonth,
      endYear,
      endMonth,
      bottomLeftYGlobal,
      topRightYGlobal,
      bottomLeftXGlobal,
      topRightXGlobal,
      minI,
      maxI,
      minJ,
      maxJ
    );

    const stitchingConfig = this.getConfig(
      startYear,
      startMonth,
      startDate.getDate(),
      startDate.getHours(),
      endYear,
      endMonth,
      endDate.getDate(),
      endDate.getHours(),
      minI,
      maxI,
      minJ,
      maxJ,
      domain
    );

    // urls.push(baseUrl + '7z.exe');
    urls.push(baseUrl + 'm3d_bild.exe');
    urls.push(baseUrl + 'start.bat');
    urls.push(baseUrl + 'readme.txt');

    return this.beginZippingCalpuff(stitchingConfig, urls);
  }

  /**
   * Creates a uuid subfolder, tells the server to start downloading and zipping the files
   * and returns early with the uuid that the frontend can use to ping Nest with to check
   * if the file is finished downloading and zipping.
   *
   * @param stitchingConfig
   * @param urls
   * @returns
   */
  beginZippingCalpuff(stitchingConfig: string, urls: string[]): { subFolder: string } {
    const subFolder = uuid.v4();
    const filePath = process.env.filePath;
    const folder =
      filePath.charAt(filePath.length - 1) == '/' ? filePath + subFolder + '/' : filePath + '/' + subFolder + '/';
    // split urls array, urls contains the search data urls which are added to a .bat file
    // urls2 contains the static files
    let urls2 = [];
    for (let i = urls.length - 3; i < urls.length; i++) {
      urls2.push(urls[i]);
    }
    urls.splice(urls.length - 3, 3);
    const downloadBat = this.createCalpuffDownloadBat(urls);
    this.zipFiles(stitchingConfig, downloadBat, urls2, folder);
    return { subFolder: subFolder };
  }

  beginZippingAermod(tileDownloadInfo: TileDownloadInfo, dataUrls: string[]): { subFolder: string } {
    const subFolder = uuid.v4();
    const filePath = process.env.filePath;
    const folder =
      filePath.charAt(filePath.length - 1) == '/' ? filePath + subFolder + '/' : filePath + '/' + subFolder + '/';
    this.zipFilesAermod(dataUrls, folder, tileDownloadInfo);
    return { subFolder: subFolder };
  }

  async beginZippingAermodFromCoords(request: {
    latitude: number;
    longitude: number;
    startDateIso: string;
    endDateIso: string;
    timezoneOffsetHours: number;
    domain: string;
  }): Promise<{ subFolder: string }> {
    const baseUrl = 'https://nrs.objectstore.gov.bc.ca/wrfdel/aermod';

    const { latitude, longitude, startDateIso, endDateIso, timezoneOffsetHours } = request;

    const closestPoint = await this.mappingService.findClosestPoint(latitude, longitude);
    if (!closestPoint) {
      throw new Error('No closest point found');
    }

    const startDate = new Date(startDateIso);
    const endDate = new Date(endDateIso);

    // Adjust for timezone
    startDate.setHours(startDate.getHours() + timezoneOffsetHours);
    endDate.setHours(endDate.getHours() + timezoneOffsetHours);

    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    const tileDownloadInfo: TileDownloadInfo = {
      startYear,
      startMonth: startDate.getMonth() + 1,
      startDay: startDate.getDate(),
      startHour: startDate.getHours(),
      endYear,
      endMonth: endDate.getMonth() + 1,
      endDay: endDate.getDate(),
      endHour: endDate.getHours(),
      timeZone: timezoneOffsetHours,
      latitude,
      longitude,
      closestPoint: {
        i: closestPoint.i,
        j: closestPoint.j,
        lat: latitude,
        lon: longitude,
        tile_id: closestPoint.tile,
        domain: closestPoint.domain,
        filename: closestPoint.tile.toString().padStart(4, '0'),
        full_url: '', // not used now
      },
    };

    const dataUrls: string[] = [];
    const domain = closestPoint.domain;
    const tileId = closestPoint.tile.toString().padStart(4, '0');
    for (let year = startYear; year <= endYear; year++) {
      dataUrls.push(`${baseUrl}/${domain}/${tileId}/wrfout_${domain}_${tileId}_${year}.nc`);
    }

    // const urls: string[] = [baseUrl + 'start.bat', baseUrl + 'readme.txt', baseUrl + 'mmif.inp'];

    return this.beginZippingAermod(tileDownloadInfo, dataUrls);
  }

  /**
   * Saves each file to a path designated by variable folder,
   * A util function then zips the files on the disk and non-zipped files
   * are cleaned up.
   * This function does not return the file, that is done elsewhere.
   *
   * @param stitchingConfig
   * @param urls
   * @returns readstream
   */
  async zipFiles(stitchingConfig: string, downloadBat: string, urls: string[], folder: string): Promise<void> {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    let fileName = 'm3d_bild.inp';
    const downloadBatFileName = 'download.bat';
    let files = [];

    files.push(folder + fileName);
    if (stitchingConfig) {
      fs.writeFile(folder + fileName, stitchingConfig, function (err) {
        if (err) throw err;
        console.log('Saved ' + fileName);
      });
    }
    files.push(folder + downloadBatFileName);
    fs.writeFile(folder + downloadBatFileName, downloadBat, function (err) {
      if (err) throw err;
      console.log('Saved ' + downloadBatFileName);
    });

    for (let url of urls) {
      fileName = url.split('/').pop();
      console.log('Downloading file from ' + url);
      files.push(folder + fileName);
      if (fileName == 'start.bat') {
        const data = await lastValueFrom(this.httpService.get(url).pipe(map((response) => response.data)));
        fs.writeFile(folder + fileName, data, function (err) {
          if (err) throw err;
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        let startBatContent = fs.readFileSync(folder + fileName, 'utf8', (err, data) => {});
        startBatContent = startBatContent.replace(
          'rem Batch file extract zip files, runs Fortran code',
          'rem Batch file extract zip files, runs Fortran code\n\ncall download.bat'
        );
        startBatContent = startBatContent.replace(
          'curl -O https://nrs.objectstore.gov.bc.ca/kadkvt/7z.dll --retry 10',
          ''
        );
        startBatContent = startBatContent.replace('7z x *.m3d.7z', '');
        fs.writeFile(folder + fileName, startBatContent, function (err) {
          if (err) throw err;
        });
        console.log('Saved ' + fileName);
      } else {
        await downloadFile(url, folder + fileName);
        console.log('Saved ' + fileName);
      }
    }
    await zipFiles(files, folder);
    for (let file of files) {
      fs.unlink(file, (err) => {
        if (err) {
          throw new Error(`Error deleting file: ${err}`);
        }
      });
    }
    fs.writeFile(folder + 'Complete', '', function (err) {
      if (err) throw err;
      console.log('Zipping Complete');
    });
  }

  async zipFilesAermod(downloadUrls: string[], folder: string, tileDownloadInfo: TileDownloadInfo): Promise<void> {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }

    try {
      // m3d exe
      const m3dExe = await lastValueFrom(
        this.httpService.get('https://nrs.objectstore.gov.bc.ca/kadkvt/').pipe(map((response) => response.data))
      );
      fs.writeFile(folder + 'm3d_bild.exe', m3dExe, function (err) {
        if (err) throw err;
      });
      console.log('Saved m3d_bild.exe');
      // readme.txt
      const readmeContent = this.createAermodReadme();
      fs.writeFile(folder + 'readme.txt', readmeContent, function (err) {
        if (err) throw err;
      });
      console.log('Saved ' + 'readme.txt');
      // start.bat
      const startBatContent = this.createAermodStartBat();
      fs.writeFile(folder + 'start.bat', startBatContent, function (err) {
        if (err) throw err;
      });
      console.log('Saved ' + 'start.bat');
      // download.bat
      const downloadBatContent = this.createAermodDownloadBat(downloadUrls);
      fs.writeFile(folder + 'download.bat', downloadBatContent, function (err) {
        if (err) throw err;
      });
      console.log('Saved ' + 'download.bat');
      // mmif.inp
      const mmifContent = this.createAermodConfig(tileDownloadInfo);
      fs.writeFile(folder + 'mmif.inp', mmifContent, function (err) {
        if (err) throw err;
      });
      console.log('Saved ' + 'mmif.inp');
      const files = [
        folder + 'm3d_bild.exe',
        folder + 'readme.txt',
        folder + 'start.bat',
        folder + 'download.bat',
        folder + 'mmif.inp',
      ];
      await zipFiles(files, folder);
      for (let file of files) {
        fs.unlink(file, (err) => {
          if (err) {
            throw new Error(`Error deleting file: ${err}`);
          }
        });
      }
      fs.writeFile(folder + 'Complete', '', function (err) {
        if (err) throw err;
        console.log('Zipping Complete');
      });
    } catch (err) {
      console.log('Something went wrong while downloading or zipping the files.');
      console.log(err);
    }
  }

  /**
   * Checks if the files have been zipped yet.
   *
   * @param subFolder
   * @returns true or false
   */
  checkZipFile(subFolder: string): { status: string; num: string } {
    const filePath = process.env.filePath;
    const folder =
      filePath.charAt(filePath.length - 1) == '/' ? filePath + subFolder + '/' : filePath + '/' + subFolder + '/';
    const completionFileName = folder + 'Complete';
    const files = fs.readdirSync(folder);
    return {
      status: fs.existsSync(completionFileName) ? 'Ready' : 'Not Ready',
      num: files.length,
    };
  }

  /**
   * After the files are zipped, there will be a zip file in the subFolder specified
   * by the subFolder variable. Return that zip file and then delete it.
   *
   * @param subFolder
   * @returns the zip file as a readstream
   */
  async serveZipFile(subFolder: string): Promise<any> {
    const filePath = process.env.filePath;
    const folder =
      filePath.charAt(filePath.length - 1) == '/' ? filePath + subFolder + '/' : filePath + '/' + subFolder + '/';
    const zipFileName = folder + process.env.zipFileName;
    const completionFileName = folder + 'Complete';
    const dirPath = folder.slice(0, -1);
    try {
      const readStream = fs.createReadStream(zipFileName);
      readStream.on('close', () => {
        fs.unlinkSync(zipFileName, (err) => {
          if (err) {
            throw new Error(`Error deleting zip file: ${err}`);
          }
        });
        fs.unlinkSync(completionFileName, (err) => {
          if (err) {
            throw new Error(`Error deleting completion file: ${err}`);
          }
        });
        fs.rmdir(dirPath, (err) => {
          if (err) {
            throw new Error(`Error deleting directory: ${err}`);
          }
        });
      });
      return readStream;
    } catch (err) {
      console.log(err);
    }
  }
  createCalpuffDownloadBat(downloadUrls: string[]): string {
    let batchFileContent = '';
    downloadUrls.forEach((url) => {
      const fileName = url.split('/').pop();
      batchFileContent += `curl -O ${url} --retry 10\n`;
      // Rename .m3d files to remove domain suffix (e.g., .d03.m3d -> .m3d) for M3D_BILD compatibility
      if (fileName && fileName.endsWith('.m3d')) {
        const newFileName = fileName.replace(/\.d\d+\.m3d$/, '.m3d');
        if (newFileName !== fileName) {
          batchFileContent += `ren "${fileName}" "${newFileName}"\n`;
        }
      }
    });
    return batchFileContent;
  }

  createAermodDownloadBat(downloadUrls: string[]): string {
    let batchFileContent = '';
    downloadUrls.forEach((url) => {
      batchFileContent += `curl -O ${url} --retry 10\n`;
    });
    return batchFileContent;
  }

  private getConfig(
    isyear: number,
    ismonth: number,
    isday: number,
    ishour: number,
    ieyear: number,
    iemonth: number,
    ieday: number,
    iehour: number,
    ni1: number,
    ni2: number,
    nj1: number,
    nj2: number,
    domain: string
  ): string {
    console.log(`ni1: ${ni1}`);
    console.log(`ni2: ${ni2}`);
    console.log(`nj1: ${nj1}`);
    console.log(`nj2: ${nj2}`);
    console.log(`domain: ${domain}`);

    return this.getCalpuffM3dBild(
      isyear,
      ismonth,
      isday,
      ishour,
      ieyear,
      iemonth,
      ieday,
      iehour,
      ni1,
      ni2,
      nj1,
      nj2,
      domain
    );
  }

  private ensureCalpuffIndexLoaded(): void {
    if (this.calpuffIndex) {
      return;
    }

    const csvPath = 'dist/public/js/gis/calpuff_files.csv';
    const csv = fs.readFileSync(csvPath, 'utf-8');
    const lines = csv.trim().split(/\r?\n/);
    lines.shift(); // header

    this.calpuffIndex = lines
      .map((line: string) => line.split(','))
      .map((cols) => {
        return {
          filename: cols[0],
          year: parseInt(cols[1], 10),
          month: parseInt(cols[2], 10),
          domain: cols[3],
          tileId: cols[4],
          i0: parseInt(cols[5], 10),
          j0: parseInt(cols[6], 10),
          i1: parseInt(cols[7], 10),
          j1: parseInt(cols[8], 10),
          lat0: parseFloat(cols[9]),
          lon0: parseFloat(cols[10]),
          lat1: parseFloat(cols[11]),
          lon1: parseFloat(cols[12]),
          url: cols[13],
        } as CalpuffFileRecord;
      })
      .filter((r) => ![r.year, r.month, r.lat0, r.lon0, r.lat1, r.lon1].some((v) => Number.isNaN(v)));
  }

  private lookupCalpuffUrls(
    domain: string,
    startYear: number,
    startMonth: number,
    endYear: number,
    endMonth: number,
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
    minI?: number,
    maxI?: number,
    minJ?: number,
    maxJ?: number
  ): string[] {
    console.log(`minI: ${minI}`);
    console.log(`maxI: ${maxI}`);
    console.log(`minJ: ${minJ}`);
    console.log(`maxJ: ${maxJ}`);
    this.ensureCalpuffIndexLoaded();
    if (!this.calpuffIndex) {
      return [];
    }

    let startKey = startYear * 100 + startMonth;
    let endKey = endYear * 100 + endMonth;

    if (startKey > endKey) {
      const tmp = startKey;
      startKey = endKey;
      endKey = tmp;
    }

    const urls: string[] = [];
    const seen = new Set<string>();

    for (const rec of this.calpuffIndex) {
      const ym = rec.year * 100 + rec.month;
      if (ym < startKey || ym > endKey) {
        continue;
      }

      if (rec.domain !== domain) {
        continue;
      }

      let overlaps = false;
      if (minI !== undefined && maxI !== undefined && minJ !== undefined && maxJ !== undefined) {
        // Use grid I/J intersection
        overlaps = rec.i0 <= maxI && rec.i1 >= minI && rec.j0 <= maxJ && rec.j1 >= minJ;
      } else {
        // Fallback to lat/lon bounding box intersection
        const recMinLat = Math.min(rec.lat0, rec.lat1);
        const recMaxLat = Math.max(rec.lat0, rec.lat1);
        const recMinLon = Math.min(rec.lon0, rec.lon1);
        const recMaxLon = Math.max(rec.lon0, rec.lon1);

        const overlapsLat = recMaxLat >= minLat && recMinLat <= maxLat;
        const overlapsLon = recMaxLon >= minLon && recMinLon <= maxLon;
        overlaps = overlapsLat && overlapsLon;
      }

      if (!overlaps) {
        continue;
      }

      if (!seen.has(rec.url)) {
        seen.add(rec.url);
        urls.push(rec.url);
      }
    }
    console.log('download urls');
    console.log(urls);
    return urls;
  }

  createAermodStartBat(): string {
    return `
rem Batch file extract zip files, runs Fortran code

call download.bat

m3d_bild
md output
ren "x???y???x???y???.?????????????????????.output.m3d" "/////////////////wrf.?????????????????????.output.m3d"
move wrf.* output\
    `;
  }

  createAermodConfig(tileDownloadInfo: TileDownloadInfo): string {
    // Autoinsert point 1
    const startDate = `Start ${tileDownloadInfo.startYear} ${tileDownloadInfo.startMonth
      .toString()
      .padStart(2, '0')} ${tileDownloadInfo.startDay.toString().padStart(2, '0')} ${tileDownloadInfo.startHour
      .toString()
      .padStart(2, '0')}`;
    const stopDate = `Stop ${tileDownloadInfo.endYear} ${tileDownloadInfo.endMonth
      .toString()
      .padStart(2, '0')} ${tileDownloadInfo.endDay.toString().padStart(2, '0')} ${tileDownloadInfo.endHour
      .toString()
      .padStart(2, '0')}`;
    // Autoinsert point 2
    const tz = tileDownloadInfo.timeZone;
    const domain = tileDownloadInfo.closestPoint.domain;
    const timeZone = `TIMEZONE ${tz > 0 ? '-' : ''}${tz} !default is zero, i.e. GMT-00`;
    // Autoinsert point 3
    const latLonLine = `POINT LATLON ${tileDownloadInfo.latitude} ${tileDownloadInfo.longitude}`;
    // Autoinsert point 4
    const inputLines = [];
    let tileId = '';
    tileId = tileDownloadInfo.closestPoint
      ? tileDownloadInfo.closestPoint.filename
        ? tileDownloadInfo.closestPoint.filename.split('.')[0]
        : ''
      : '';
    for (let year = tileDownloadInfo.startYear; year <= tileDownloadInfo.endYear; year++) {
      inputLines.push(`Input "${tileId}\\wrfout_${domain}_${tileId}_${year}.nc"`);
    }
    const inputString = inputLines.join('\n');

    const mmifContent = `
# AUTOINSERT POINT 01
${startDate}
${stopDate}
# based on user-specified start and end date
# Start <yyyy mm dd hh>
# Stop <yyyy mm dd hh>
# example below
# Start 2011 01 01 00
# Stop 2012 01 01 23

# TimeZone is relative to GMT, i.e. -5 (GMT-05) is the US East Coast

# AUTOINSERT POINT 02
${timeZone}
# based on user-specified time zone
# TIMEZONE <tz> !default is zero, i.e. GMT-00

# MMIFv3.x auto-detects if INPUT files are MM5 or WRF files, so METFORM
# should be included only if MMIF gets it wrong, and you need to over-ride.
# MetForm WRF 
# GRID has three options: IJ, LL (or latlon), or KM (or PROJ,LCC,PS,EM),
# followed by two lower-left coordinates, and two upper-right coordinates.
# Default is to output the whole grid, after trimming 5 points off each edge.
Grid IJ 0,0 0,0 ! default -5,-5 -5,-5
# LAYERS has four options: TOP, MID, K, followed by the values to be used.
# Default is the EPA/FLM Guidance layers.
layers top 20 40 80 160 320 640 1200 3000 4000 !default top 20 40 80 160 320 640 1200 3000 4000
# PG STABILITY class calculation method is either SRDT or GOLDER (default) stability GOLDER !default GOLDER
CLOUDCOVER ANGEVINE
# PBL_Recalc is either TRUE or FALSE (default), to re-calculate or
# pass-through the mixing height.
PBL_recalc FALSE !default FALSE
# AER_MIN_SPEED is the lower bound on windspeed in AERMOD mode.
# AER_MIN_MIXHT is the lower bound on both Convective and Mechanical
# Mixing Heights in AERMOD mode.
# AER_MIN_OBUK is the lower bound on Monin-Obukhov length, such that
# ABS(L) > AER_min_Obuk, in AERMOD mode.
aer_min_speed 0.5 !default 0.5
aer_min_mixht 1.0 !default 1
aer_min_obuk 1.0 !default 1
FSL_INTERVAL 12 !default 12

# AUTOINSERT POINT 03
${latLonLine}
# See the Users Guide for the OUTPUT keyword details
OUTPUT AERMOD SFC "output\aermod.sfc"
OUTPUT AERMOD PFL "output\aermod.pfl"

# AUTOINSERT POINT 04
${inputString}
# Insert the lines below based on user selection
# insert one line for all included year/s
# Input "<tile>\wrfout_d02_<tile>_<yyyy>.nc
`;
    return mmifContent;
  }

  createAermodReadme(): string {
    return `
Weather Research and Forecasting Model (WRF) Data Package

Description:
This file provides the post-download instructions for WRF Data. It generates a CALMET-ready (i.e., 3D.DAT format) file for the CALPUFF model system based on the spatial domain and time range defined from the interactive map. Data interval of one month is recommended when using CALMET. 

Requirements/Pre-requisites: 
- Windows-based Computer
- WRF Data Package extracted into a dedicated folder

Instructions:
- Double click the Start.bat to begin automated process of downloading and extracting data, and generating the output file
- Locate the "output" folder. This folder contains the output file (.output.m3d). It contains the m3d data based on the domain and dates specified.
- To model multiple months, relocate and rename to keep each output files organized for CALMET modelling.

Contact Information:
If you have any questions, please email bcdispersion.model@gov.bc.ca.
Github link https://github.com/bcgov/nr-wrf
`;
  }

  getCalpuffM3dBild(
    isyear: number,
    ismonth: number,
    isday: number,
    ishour: number,
    ieyear: number,
    iemonth: number,
    ieday: number,
    iehour: number,
    ni1: number,
    ni2: number,
    nj1: number,
    nj2: number,
    domain: string
  ): string {
    // Domain-specific grid bounds from tile data
    const domainConfigs = {
      d02: { NBI: 2, NEI: 391, NBJ: 2, NEJ: 373, JSPLIT: 186 },
      d03: { NBI: 6, NEI: 95, NBJ: 6, NEJ: 95, JSPLIT: 47 },
      d04: { NBI: 6, NEI: 95, NBJ: 6, NEJ: 95, JSPLIT: 47 },
      d05: { NBI: 6, NEI: 95, NBJ: 6, NEJ: 95, JSPLIT: 47 },
      d06: { NBI: 1, NEI: 108, NBJ: 1, NEJ: 102, JSPLIT: 51 },
    };

    const config = domainConfigs[domain] || domainConfigs['d02'];

    const outputFileName = `${isyear}${String(ismonth).padStart(2, '0')}${String(isday).padStart(2, '0')}${String(
      ishour
    ).padStart(2, '0')}_${ieyear}${String(iemonth).padStart(2, '0')}${String(ieday).padStart(2, '0')}${String(
      iehour
    ).padStart(2, '0')}.output.m3d`;

    return `M3D_BILD.INP    1.0             Initial Configuration
--------------------------------------------------------------------------------

                    M3D_BILD Processor CONTROL FILE
                    -------------------------------
PURPOSE
-------

This utility reads a set of tiled M3D (3D.DAT) files and creates a single M3D
file for a specified i,j range and time range.  Inputs allow the full pathname
to be constructed for all of the tiles that are needed, and the name of the
output M3D file.

--------------------------------------------------------------------------------

INPUT GROUP 1: Processing Control
---------------------------------

     Range of times to include in OUTPUT M3D file:
     ---------------------------------------------

     Starting date and time (UTC)    ! ISYEAR = ${isyear} !
                                     ! ISMONTH = ${ismonth} !
                                     ! ISDAY = ${isday} !
                                     ! ISHOUR = ${ishour} !

     Ending date and time (UTC)      ! IEYEAR = ${ieyear} !
                                     ! IEMONTH = ${iemonth} !
                                     ! IEDAY = ${ieday} !
                                     ! IEHOUR = ${iehour} !


     Range of M3D cells to include in OUTPUT M3D file:
     -------------------------------------------------

     Starting cell in x-direction (NI1)     No Default    ! NI1 = ${ni1} !
     Ending   cell in x-direction (NI2)     No Default    ! NI2 = ${ni2} !

     Starting cell in y-direction (NJ1)     No Default    ! NJ1 = ${nj1} !
     Ending   cell in y-direction (NJ2)     No Default    ! NJ2 = ${nj2} !



     Output Files:
     -------------
     List-file        Default: M3D_BILD.LST    ! LSTFILE = m3d_bild_temp.lst !

     M3D-file-root    No Default               ! OUTUSER = ${outputFileName} !
        User-supplied portion of the name of the OUTPUT M3D file is appended to cell-range:
        Output file name is 'Xni1Ynj1Xni2Ynj2.OUTUSER'

     Convert all file names to lower case?
         T = lower case       (LCFILES)     Default: F    ! LCFILES = T !
         F = UPPER CASE


!END!


--------------------------------------------------------------------------------

INPUT GROUP 2: Tile Configuration
---------------------------------


     Number of M3D cells/TILE:
     Number in X-direction (NCI)            No Default    ! NCI = 10 !
     Number in Y-direction (NCJ)            No Default    ! NCJ = 10 !

     Starting cell in x-direction (NBI)     No Default    ! NBI = ${config.NBI} !
     Ending   cell in x-direction (NEI)     No Default    ! NEI = ${config.NEI} !
     Starting cell in y-direction (NBJ)     No Default    ! NBJ = ${config.NBJ} !
     Ending   cell in y-direction (NEJ)     No Default    ! NEJ = ${config.NEJ} !


     Tiles are stored in two locations, split by cell index J
                             (JSPLIT)       No Default    ! JSPLIT = ${config.JSPLIT} !

     Tiles with cells whose J-index is GREATER than NJSPLIT are stored in
     the NORTH location, on a drive whose path is PATH_N.
                             (PATH_N)       No Default    ! PATH_N =  !

     Tiles with cells whose J-index is LESS than or EQUAL to NJSPLIT are
     stored in the SOUTH location, on a drive whose path is PATH_S.
                             (PATH_S)       No Default    ! PATH_S =  !

`;
  }

  @Cron('0 0 0 * * *', { timeZone: 'America/Los_Angeles' })
  cleanFolder() {
    console.log('Cleaning folders');
    let numDeleted = 0;
    let folderPath = process.env.filePath;
    if (folderPath.charAt(folderPath.length - 1) == '/') {
      folderPath = folderPath.slice(0, -1);
    }

    // Get an array of all the subfolders in the specified folder
    const subfolders: string[] = fs.readdirSync(folderPath).filter((file) => {
      const filePath: string = `${folderPath}/${file}`;
      return fs.statSync(filePath).isDirectory();
    });

    // Loop through each subfolder and check its creation date
    subfolders.forEach((subfolder) => {
      // Get the full path to the subfolder
      const subfolderPath: string = `${folderPath}/${subfolder}`;

      // Get the creation date of the subfolder
      const creationDate: Date = fs.statSync(subfolderPath).birthtime;
      // Check if the subfolder is more than a day old
      if (Date.now() - creationDate.getTime() > 86400000) {
        // Delete the subfolder and all files inside
        fs.rmSync(subfolderPath, { recursive: true });
        numDeleted++;
      }
    });
    console.log(`Deleted ${numDeleted} folders.`);
  }
}
