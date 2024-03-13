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

@Injectable()
export class ZipFileService {
  constructor(private httpService: HttpService) {
    // docker hostname is the container name, use localhost for local development
    hostname = process.env.BACKEND_URL ? process.env.BACKEND_URL : `http://localhost`;
    // local development backend port is 3001, docker backend port is 3000
    // port = process.env.BACKEND_URL ? 3000 : 3001;
    port = 3000; // frontend = 8080, backend = 3000 for now
  }

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

  // /**
  //  * Downloads each file into a buffer which gets passed
  //  * to a util function which zips them and returns them.
  //  * Done in memory, large memory size.
  //  *
  //  * @param stitchingConfig
  //  * @param urls
  //  * @returns readstream
  //  */
  // async zipFiles(stitchingConfig: string, urls: string[]): Promise<any> {
  //   let count = 0;
  //   const files = [
  //     { data: Buffer.from(stitchingConfig), name: "m3d_bild.inp" },
  //   ];

  //   for (let url of urls) {
  //     count++;
  //     // add the zip file
  //     const data = await lastValueFrom(
  //       this.httpService.get(url).pipe(map((response) => response.data))
  //     );
  //     console.log("Downloading file from " + url);
  //     files.push({
  //       data: Buffer.from(data),
  //       name: url.substring(url.lastIndexOf("/") + 1),
  //     });
  //     if (count == urls.length) {
  //       console.log("Returning zip file");
  //       return await zipFiles(files);
  //     }
  //   }
  // }

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
