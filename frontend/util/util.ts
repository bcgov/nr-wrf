const archiver = require("archiver");
const https = require("https");
const fs = require("fs");
import { Writable } from "stream";
declare const Buffer;
import { ZipFile } from "yazl";

/**
 * @param {array<{data: Buffer, name: String}>} files
 * @returns {Promise<Buffer>}
 */
export async function zipFiles(files) {
  return new Promise((resolve, reject) => {
    const buffs = [];

    const converter = new Writable();

    converter._write = (chunk, encoding, cb) => {
      buffs.push(chunk);
      process.nextTick(cb);
    };

    converter.on("finish", () => {
      resolve(Buffer.concat(buffs));
    });

    const archive = archiver("zip");

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(converter);

    for (const file of files) {
      archive.append(file.data, { name: file.name });
    }

    return archive.finalize();
  });
}

export async function zipFiles2(
  files: string[],
  folder: string
): Promise<string> {
  const zipFile = new ZipFile();
  const zipFilePath = folder + process.env.zipFileName;

  console.log("Waiting 5 seconds before zipping...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("Zipping files.");

  for (const file of files) {
    const fileName = file.substring(file.lastIndexOf("/") + 1);
    zipFile.addFile(file, fileName);
  }

  return new Promise((resolve, reject) => {
    zipFile.outputStream
      .pipe(fs.createWriteStream(zipFilePath))
      .on("finish", () => resolve(zipFilePath))
      .on("error", (error) => reject(error));
    zipFile.end();
  });
}

export async function downloadFile(url: string, dir: string): Promise<void> {
  const file = fs.createWriteStream(dir);
  https.get(url, function (response) {
    response.pipe(file);
  });
}
