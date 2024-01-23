"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFile = exports.zipFiles2 = exports.zipFiles = void 0;
const archiver = require("archiver");
const https = require("https");
const fs = require("fs");
const stream_1 = require("stream");
const yazl_1 = require("yazl");
async function zipFiles(files) {
    return new Promise((resolve, reject) => {
        const buffs = [];
        const converter = new stream_1.Writable();
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
exports.zipFiles = zipFiles;
async function zipFiles2(files, folder) {
    const zipFile = new yazl_1.ZipFile();
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
exports.zipFiles2 = zipFiles2;
async function downloadFile(url, dir) {
    const file = fs.createWriteStream(dir);
    https.get(url, function (response) {
        response.pipe(file);
    });
}
exports.downloadFile = downloadFile;
//# sourceMappingURL=util.js.map