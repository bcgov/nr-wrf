import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, map } from 'rxjs';
import * as uuid from 'uuid';
import { downloadFile, zipFiles } from '../../util/util';
import { TileDownloadInfo } from '../../util/types';
import { Cron } from '@nestjs/schedule';
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
  constructor(private httpService: HttpService) {
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
   * End-to-end helper for the map downloads (Search 1/2/3): accept bounds/timezone/date window,
   * compute tiles, build URLs and stitching config, then kick off zipping on the server.
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
    const baseUrl = 'https://nrs.objectstore.gov.bc.ca/kadkvt/';

    const { bottomLeftYGlobal, topRightYGlobal, bottomLeftXGlobal, topRightXGlobal, startDateIso, endDateIso } =
      request;

    const { minI, maxI, minJ, maxJ } = await this.calculateVars(
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
      startYear,
      startMonth,
      endYear,
      endMonth,
      bottomLeftYGlobal,
      topRightYGlobal,
      bottomLeftXGlobal,
      topRightXGlobal
    );

    const stitchingConfig = await this.getConfig(
      baseUrl + 'm3d_bild_temp.inp',
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
      maxJ
    );

    urls.push(baseUrl + '7z.exe');
    urls.push(baseUrl + 'm3d_bild.exe');
    urls.push(baseUrl + 'start.bat');
    urls.push(baseUrl + 'readme.txt');

    return this.beginZipping(stitchingConfig, urls);
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
  beginZipping(stitchingConfig: string, urls: string[]): { subFolder: string } {
    const subFolder = uuid.v4();
    const filePath = process.env.filePath;
    const folder =
      filePath.charAt(filePath.length - 1) == '/' ? filePath + subFolder + '/' : filePath + '/' + subFolder + '/';
    // split urls array, urls contains the search data urls which are added to a .bat file
    // urls2 contains the static files
    let urls2 = [];
    for (let i = urls.length - 4; i < urls.length; i++) {
      urls2.push(urls[i]);
    }
    urls.splice(urls.length - 4, 4);
    const downloadBat = this.createDownloadBat(urls);
    this.zipFiles(stitchingConfig, downloadBat, urls2, folder);
    return { subFolder: subFolder };
  }

  beginZippingAermod(tileDownloadInfo: TileDownloadInfo, urls: string[]): { subFolder: string } {
    const subFolder = uuid.v4();
    const filePath = process.env.filePath;
    const folder =
      filePath.charAt(filePath.length - 1) == '/' ? filePath + subFolder + '/' : filePath + '/' + subFolder + '/';
    const downloadBat = this.createAermodDownloadBat(tileDownloadInfo.closestPoint.full_url);
    this.zipFilesAermod(downloadBat, urls, folder, tileDownloadInfo);
    return { subFolder: subFolder };
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
      console.log('Downloading file from ' + url);
      fileName = url.split('/').pop();
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
        startBatContent = startBatContent.replace('7z x *.m3d.7z', '7z x *.m3d.7z -aoa');
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

  async zipFilesAermod(
    downloadBat: string,
    urls: string[],
    folder: string,
    tileDownloadInfo: TileDownloadInfo
  ): Promise<void> {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    let files = [];

    try {
      for (let url of urls) {
        console.log('Downloading file from ' + url);
        let fileName = url.split('/').pop();
        files.push(folder + fileName);
        if (fileName == 'start.bat') {
          const data = await lastValueFrom(this.httpService.get(url).pipe(map((response) => response.data)));
          fs.writeFile(folder + fileName, data, function (err) {
            if (err) throw err;
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          let startBatContent = fs.readFileSync(folder + fileName, 'utf8', (err, data) => {});
          startBatContent = startBatContent.replace('call download.bat', downloadBat);
          startBatContent = startBatContent.replace('7z x *.m3d.7z', '7z x *.m3d.7z -aoa');
          fs.writeFile(folder + fileName, startBatContent, function (err) {
            if (err) throw err;
          });
          console.log('Saved ' + fileName);
        } else if (fileName == 'mmif.inp') {
          const data = await lastValueFrom(this.httpService.get(url).pipe(map((response) => response.data)));
          fs.writeFile(folder + fileName, data, function (err) {
            if (err) throw err;
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          let mmifContent = fs.readFileSync(folder + fileName, 'utf8', (err, data) => {});
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
          const dateLines = startDate + '\n' + stopDate;
          mmifContent = mmifContent.replace('# AUTOINSERT POINT 01', `# AUTOINSERT POINT 01\n${dateLines}`);
          // Autoinsert point 2
          const tz = tileDownloadInfo.timeZone;
          const timeZone = `TIMEZONE ${tz > 0 ? '-' : ''}${tz} !default is zero, i.e. GMT-00`;
          mmifContent = mmifContent.replace('# AUTOINSERT POINT 02', `# AUTOINSERT POINT 02\n${timeZone}`);
          // Autoinsert point 3
          const latLonLine = `POINT LATLON ${tileDownloadInfo.latitude} ${tileDownloadInfo.longitude}`;
          mmifContent = mmifContent.replace('# AUTOINSERT POINT 03', `# AUTOINSERT POINT 03\n${latLonLine}`);
          // Autoinsert point 4
          const inputLines = [];
          let tileId = '';
          tileId = tileDownloadInfo.closestPoint
            ? tileDownloadInfo.closestPoint.filename
              ? tileDownloadInfo.closestPoint.filename.split('.')[0]
              : ''
            : '';
          for (let year = tileDownloadInfo.startYear; year <= tileDownloadInfo.endYear; year++) {
            inputLines.push(`Input "${tileId}\\wrfout_d02_${tileId}_${year}.nc"`);
          }
          const inputString = inputLines.join('\n');
          mmifContent = mmifContent.replace('# AUTOINSERT POINT 04', `# AUTOINSERT POINT 04\n${inputString}`);

          // Write the file
          fs.writeFile(folder + fileName, mmifContent, function (err) {
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

  createDownloadBat(downloadUrls: string[]): string {
    let batchFileContent = '';
    downloadUrls.forEach((url) => {
      batchFileContent += `curl -O ${url} --retry 10\n`;
    });
    return batchFileContent;
  }

  // private calculateMinimumTileNumber(n: number): number {
  //   if (n % 10 === 2) {
  //     return n;
  //   } else if (n < 12) {
  //     n = 2;
  //   } else if (n % 10 < 2) {
  //     n = n - 10 - (n % 10) + 2;
  //   } else {
  //     n = n - (n % 10) + 2;
  //   }

  //   return n;
  // }

  private async getConfig(
    url: string,
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
    nj2: number
  ): Promise<string> {
    const response = await lastValueFrom(this.httpService.get(url, { responseType: 'text' }).pipe(map((r) => r.data)));
    let configText: string = response ?? '';

    const outputFileName = ''
      .concat(isyear.toString())
      .concat(String(ismonth).padStart(2, '0'))
      .concat(String(isday).padStart(2, '0'))
      .concat(String(ishour).padStart(2, '0'))
      .concat('_')
      .concat(ieyear.toString())
      .concat(String(iemonth).padStart(2, '0'))
      .concat(String(ieday).padStart(2, '0'))
      .concat(String(iehour).padStart(2, '0'))
      .concat('.output.m3d');

    configText = configText.replace('! OUTUSER = output.m3d !', '! OUTUSER = '.concat(outputFileName).concat(' !'));
    configText = configText.replace('! ISYEAR = 2012 !', '! ISYEAR = '.concat(isyear.toString()).concat(' !'));
    configText = configText.replace('! ISMONTH = 1 !', '! ISMONTH = '.concat(ismonth.toString()).concat(' !'));
    configText = configText.replace('! ISDAY = 1 !', '! ISDAY = '.concat(isday.toString()).concat(' !'));
    configText = configText.replace('! ISHOUR = 0 !', '! ISHOUR = '.concat(ishour.toString()).concat(' !'));

    configText = configText.replace('! IEYEAR = 2012 !', '! IEYEAR = '.concat(ieyear.toString()).concat(' !'));
    configText = configText.replace('! IEMONTH = 3 !', '! IEMONTH = '.concat(iemonth.toString()).concat(' !'));
    configText = configText.replace('! IEDAY = 1 !', '! IEDAY = '.concat(ieday.toString()).concat(' !'));
    configText = configText.replace('! IEHOUR = 0 !', '! IEHOUR = '.concat(iehour.toString()).concat(' !'));

    configText = configText.replace('! NI1 = 2 !', '! NI1 = '.concat(ni1.toString()).concat(' !'));
    configText = configText.replace('! NI2 = 3 !', '! NI2 = '.concat(ni2.toString()).concat(' !'));
    configText = configText.replace('! NJ1 = 392 !', '! NJ1 = '.concat(nj1.toString()).concat(' !'));
    configText = configText.replace('! NJ2 = 392 !', '! NJ2 = '.concat(nj2.toString()).concat(' !'));

    return configText;
  }

  private ensureCalpuffIndexLoaded(): void {
    if (this.calpuffIndex) {
      return;
    }

    const csvPath = 'dist/public/js/gis/calpuf_files.csv';
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
    startYear: number,
    startMonth: number,
    endYear: number,
    endMonth: number,
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number
  ): string[] {
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

      const recMinLat = Math.min(rec.lat0, rec.lat1);
      const recMaxLat = Math.max(rec.lat0, rec.lat1);
      const recMinLon = Math.min(rec.lon0, rec.lon1);
      const recMaxLon = Math.max(rec.lon0, rec.lon1);

      const overlapsLat = recMaxLat >= minLat && recMinLat <= maxLat;
      const overlapsLon = recMaxLon >= minLon && recMinLon <= maxLon;
      if (!overlapsLat || !overlapsLon) {
        continue;
      }

      if (!seen.has(rec.url)) {
        seen.add(rec.url);
        urls.push(rec.url);
      }
    }
    return urls;
  }

  createAermodDownloadBat(tileDataUrl: string): string {
    return `curl -O ${tileDataUrl} --retry 10\n`;
  }

  @Cron('0 0 0 * * *')
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
