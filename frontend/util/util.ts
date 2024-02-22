const https = require('https');
const fs = require('fs');
import { ZipFile } from 'yazl';

export async function zipFiles(files: string[], folder: string): Promise<string> {
  const zipFile = new ZipFile();
  const zipFilePath = folder + process.env.zipFileName;

  console.log('Waiting 5 seconds before zipping...');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log('Zipping files.');

  for (const file of files) {
    const fileName = file.substring(file.lastIndexOf('/') + 1);
    zipFile.addFile(file, fileName);
  }

  return new Promise((resolve, reject) => {
    zipFile.outputStream
      .pipe(fs.createWriteStream(zipFilePath))
      .on('finish', () => resolve(zipFilePath))
      .on('error', (error) => reject(error));
    zipFile.end();
  });
}

export async function downloadFile(url: string, dir: string): Promise<void> {
  const file = fs.createWriteStream(dir);
  https.get(url, function (response) {
    response.pipe(file);
  });
}

/**
 * Reduces the tile_domain_info data to just tile corner points
 *
 * @param {*} parsedData
 * @returns
 */
export function filterCornerPoints(parsedData: any) {
  // Assuming parsedData is the output from Papa.parse
  const points = parsedData.data;

  // Group points by tile_id
  const pointsByTile = points.reduce((acc, point) => {
    acc[point.tile_id] = acc[point.tile_id] || [];
    acc[point.tile_id].push(point);
    return acc;
  }, {});

  const cornerPoints = Object.values(pointsByTile).flatMap((group: any) => {
    // Ensure 'i', 'j', 'tile_id' are integers, and 'lat', 'lon' are floats
    const groupWithParsedNumbers = group.map((point) => ({
      ...point,
      i: parseInt(point.i),
      j: parseInt(point.j),
      lat: parseFloat(point.lat),
      lon: parseFloat(point.lon),
      tile_id: parseInt(point.tile_id),
    }));

    // Determine the min and max of i and j to find corner points
    const minI = Math.min(...groupWithParsedNumbers.map((point) => point.i));
    const maxI = Math.max(...groupWithParsedNumbers.map((point) => point.i));
    const minJ = Math.min(...groupWithParsedNumbers.map((point) => point.j));
    const maxJ = Math.max(...groupWithParsedNumbers.map((point) => point.j));

    return groupWithParsedNumbers.filter(
      (point) =>
        (point.i === minI && point.j === minJ) ||
        (point.i === minI && point.j === maxJ) ||
        (point.i === maxI && point.j === minJ) ||
        (point.i === maxI && point.j === maxJ)
    );
  });

  return cornerPoints;
}

/**
 * Removes deadzones between tiles by shifting tile borders closer
 *
 * @param {*} points
 * @returns
 */
export function updateCornerCoordinates(points: any) {
  const groupedPoints = {};

  // Iterate over each point and group based on conditions
  points.forEach((point1, index1) => {
    if (point1 !== null) {
      const similarPoints = [point1]; // Array to store points that need averaging

      points.forEach((point2, index2) => {
        if (
          point2 !== null &&
          ((point1.j === point2.j && Math.abs(point1.i - point2.i) === 1) ||
            (point1.i === point2.i && Math.abs(point1.j - point2.j) === 1) ||
            (Math.abs(point1.i - point2.i) === 1 && Math.abs(point1.j - point2.j) === 1))
        ) {
          similarPoints.push(point2);
          // Mark the point to be skipped in the next iterations
          points[index2] = null;
        }
      });

      // Calculate averages
      const avgI = similarPoints.reduce((sum, p) => sum + p.i, 0) / similarPoints.length;
      const avgJ = similarPoints.reduce((sum, p) => sum + p.j, 0) / similarPoints.length;
      const avgLat = similarPoints.reduce((sum, p) => sum + p.lat, 0) / similarPoints.length;
      const avgLon = similarPoints.reduce((sum, p) => sum + p.lon, 0) / similarPoints.length;

      // Update the points with averaged values and their tile_id
      similarPoints.forEach((p) => {
        p.i = avgI;
        p.j = avgJ;
        p.lat = avgLat;
        p.lon = avgLon;
      });

      // Group by the averaged point's tile_id
      const key = `${avgI.toFixed(4)},${avgJ.toFixed(4)},${avgLat.toFixed(4)},${avgLon.toFixed(4)}`;
      if (!groupedPoints[key]) {
        groupedPoints[key] = [];
      }
      groupedPoints[key].push(...similarPoints);
    }
  });

  // Flatten and format the output
  const flattenedOutput = Object.values(groupedPoints)
    .flat()
    .map((point: any) => ({
      i: point.i.toFixed(4),
      j: point.j.toFixed(4),
      lon: point.lon.toFixed(4),
      lat: point.lat.toFixed(4),
      tile_id: point.tile_id,
    }));

  return flattenedOutput;
}
