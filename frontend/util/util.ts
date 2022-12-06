const archiver = require('archiver');
import { Writable } from 'stream'
declare const Buffer;

/**
 * @param {array<{data: Buffer, name: String}>} files
 * @returns {Promise<Buffer>}
 */
export async function zipFiles (files) {
  return new Promise((resolve, reject) => {
    const buffs = []

    const converter = new Writable()

    converter._write = (chunk, encoding, cb) => {
      buffs.push(chunk)
      process.nextTick(cb)
    }

    converter.on('finish', () => {
      resolve(Buffer.concat(buffs))
    })

    const archive = archiver('zip')

    archive.on('error', err => {
      reject(err)
    })

    archive.pipe(converter)

    for (const file of files) {
      archive.append(file.data, { name: file.name })
    }

    return archive.finalize()
  })
}