import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom, map } from "rxjs";
import * as uuid from "uuid";
import { zipFiles, zipFiles2 } from "../../util/util";
import { Cron } from "@nestjs/schedule";
const fs = require("fs");

let hostname: string;
let port: number;

@Injectable()
export class ZipFileService {
  constructor(private httpService: HttpService) {
    // docker hostname is the container name, use localhost for local development
    hostname = process.env.BACKEND_URL
      ? process.env.BACKEND_URL
      : `http://localhost`;
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

  /**
   * Downloads each file into a buffer which gets passed
   * to a util function which zips them and returns them.
   * Done in memory, large memory size.
   *
   * @param stitchingConfig
   * @param urls
   * @returns readstream
   */
  async zipFiles(stitchingConfig: string, urls: string[]): Promise<any> {
    let count = 0;
    const files = [
      { data: Buffer.from(stitchingConfig), name: "m3d_bild.inp" },
    ];

    for (let url of urls) {
      count++;
      // add the zip file
      const data = await lastValueFrom(
        this.httpService.get(url).pipe(map((response) => response.data))
      );
      console.log("Downloading file from " + url);
      files.push({
        data: Buffer.from(data),
        name: url.substring(url.lastIndexOf("/") + 1),
      });
      if (count == urls.length) {
        console.log("Returning zip file");
        return await zipFiles(files);
      }
    }
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
      filePath.charAt(filePath.length - 1) == "/"
        ? filePath + subFolder + "/"
        : filePath + "/" + subFolder + "/";
    this.zipFiles2(stitchingConfig, urls, folder);
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
  async zipFiles2(
    stitchingConfig: string,
    urls: string[],
    folder: string
  ): Promise<void> {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    let fileName = "m3d_bild.inp";
    let files = [];

    files.push(folder + fileName);
    fs.writeFile(folder + fileName, stitchingConfig, function (err) {
      if (err) throw err;
      console.log("Saved " + fileName);
    });

    for (let url of urls) {
      const data = await lastValueFrom(
        this.httpService.get(url).pipe(map((response) => response.data))
      );
      console.log("Downloading file from " + url);
      fileName = url.split("/").pop();
      files.push(folder + fileName);
      fs.writeFile(folder + fileName, data, function (err) {
        if (err) throw err;
      });
      console.log("Saved " + fileName);
    }
    console.log("Zipping files.");
    await zipFiles2(files, folder);
    for (let file of files) {
      fs.unlink(file, (err) => {
        if (err) {
          throw new Error(`Error deleting file: ${err}`);
        }
      });
    }
    fs.writeFile(folder + "Complete", "", function (err) {
      if (err) throw err;
      console.log("Zipping Complete");
    });
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
      filePath.charAt(filePath.length - 1) == "/"
        ? filePath + subFolder + "/"
        : filePath + "/" + subFolder + "/";
    const completionFileName = folder + "Complete";
    const files = fs.readdirSync(folder);
    return {
      status: fs.existsSync(completionFileName) ? "Ready" : "Not Ready",
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
      filePath.charAt(filePath.length - 1) == "/"
        ? filePath + subFolder + "/"
        : filePath + "/" + subFolder + "/";
    const zipFileName = folder + process.env.zipFileName;
    const completionFileName = folder + "Complete";
    const dirPath = folder.slice(0, -1);
    try {
      const readStream = fs.createReadStream(zipFileName);
      readStream.on("close", () => {
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

  @Cron("0 0 0 * * *")
  cleanFolder() {
    console.log("Cleaning folders");
    let numDeleted = 0;
    let folderPath = process.env.filePath;
    if (folderPath.charAt(folderPath.length - 1) == "/") {
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
