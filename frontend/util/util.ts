const archiver = require("archiver");
import { Writable } from "stream";
declare const Buffer;

import { createReadStream, createWriteStream } from "fs";
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

export async function zipFiles2(files: string[]): Promise<string> {
  const zipFile = new ZipFile();
  const zipFileName = "C:/files/zipped_files.zip";

  for (const file of files) {
    const fileName = file.substring(file.lastIndexOf("/") + 1);
    zipFile.addReadStream(createReadStream(file), fileName);
  }

  return new Promise((resolve, reject) => {
    zipFile.outputStream
      .pipe(createWriteStream(zipFileName))
      .on("finish", () => resolve(zipFileName))
      .on("error", (error) => reject(error));
    zipFile.end();
  });
}
