import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import crossFetch from 'cross-fetch';

const MAX_J = 425;
const MAX_I = 476;
let lines;
let linesNums = [];

@Injectable()
export class DataService {
  constructor() {
    crossFetch('https://nrs.objectstore.gov.bc.ca/kadkvt/domaininfo_bcwrf.csv')
		.then(function (response) {
			return response.text()
		})
		.then(function (csv) {
			// each line has the format I,J,LAT,LON
			lines = csv.split("\n");

			for (var n = 3; n < lines.length; n++) {
				var currentLine = lines[n].split(",");
	
				linesNums.push(
					[
                        parseInt(currentLine[0]),
                        parseInt(currentLine[1]),
                        parseFloat(currentLine[2]),
                        parseFloat(currentLine[3])
                    ]);
	
			}
		});
    }

    async calculateVars(bottomLeftYGlobal: number, topRightYGlobal: number, bottomLeftXGlobal: number, topRightXGlobal: number): Promise<any> {   
        var minJ = await this.calculateMinimumJ(bottomLeftYGlobal);
        console.log("minJ: " + minJ);
        
        var maxJ = await this.calculateMaximumJ(topRightYGlobal, minJ);
        console.log("maxJ: " + maxJ)

        // possible bug, the geomapping.js passes 3 vars when there are 2
        // this means it passes minJ as maxJ  and maxJ is lost
        var minI = await this.calculateMinimumI(bottomLeftXGlobal, minJ);
        console.log("minI: " + minI);
        
        var maxI = await this.calculateMaximumI(topRightXGlobal, minJ);
        console.log("maxI: " + maxI);
                
        minJ = await this.calculateMinimumJ(bottomLeftYGlobal, minJ, maxJ, minI, maxI);
        console.log("Refined minJ: " + minJ);
        
        maxJ = await this.calculateMaximumJ(topRightYGlobal, minJ, maxJ, minI, maxI);
        console.log("Refined maxJ: " + maxJ);
    
        return {
          minI: minI,
          maxI: maxI,
          minJ: minJ,
          maxJ: maxJ,
        }
      }
    
    // calculate the largest J value less than the southern boundary that the user selected
    async calculateMinimumJ(
        latitude: number, 
        previousMinJ: number = 2, 
        previousMaxJ: number = MAX_J,  
        minI: number = 2, 
        maxI: number = MAX_I
        ): Promise<number> {

        var minJ = 2;

        for (var jScan = previousMinJ; jScan <= previousMaxJ; jScan++) {

            var inDomain = true;

            // see if there are any values at the current J where all js are inside the boundary
            for (var n = 0; n < linesNums.length; n++) {
                var currentLine = linesNums[n];
                var currentI = currentLine[0]
                var currentJ = currentLine[1];
                var currentLatitude = currentLine[2];

                // we're only interested in the latitudes at jScan, ignore everything until we get to jScan
                if (currentJ < jScan) {
                    continue;
                }

                // we're beyond jScan, stop searching
                if (currentJ > jScan) {
                    break;
                }

                // constrain based on min/max i values
                if (currentI < minI || currentI > maxI || jScan < previousMinJ || jScan > previousMaxJ) {
                    continue;
                }

                // we're only checking j values that match jScan.  More specifically, we're
                // ensuring that for each jScan value, every corresponding j is less than the southern latitude entered by the user
                if (jScan == currentJ && currentLatitude >= latitude) {
                    inDomain = false;
                    break;
                }
            }

            if (inDomain && jScan > minJ) {
                minJ = jScan;
            }
            
        }
        return (minJ);
    }

    // calculate the largest J value less than the southern boundary that the user selected
    // Default parameters are used if we haven't yet calculated the J or I values
    async calculateMaximumJ(
        latitude: number,
        previousMinJ: number = 2, 
        previousMaxJ: number = MAX_J, 
        minI: number = 2, 
        maxI: number = MAX_I, 
        ): Promise<number> {

        var maxJ = MAX_J;

        for (var jScan = previousMinJ; jScan <= previousMaxJ; jScan++) {

            var inDomain = true;

            // see if there are any values at the current J where all js are inside the boundary
            for (var n = 0; n < linesNums.length; n++) {
                var currentLine = linesNums[n];
                var currentI = currentLine[0];
                var currentJ = currentLine[1];
                var currentLatitude = currentLine[2];

                // we're only interested in the latitudes at jScan, ignore everything until we get to jScan
                if (currentJ < jScan) {
                    continue;
                }

                // we're beyond jScan, stop searching
                if (currentJ > jScan) {
                    break;
                }

                // constrain based on min/max i values
                if (currentI < minI || currentI > maxI || jScan < previousMinJ || jScan > previousMaxJ) {
                    continue;
                }

                // we're only checking j values that match jScan.  More specifically, we're
                // ensuring that for each jScan value, every corresponding j is greater than the northernmost latitude entered by the user
                if (jScan != currentJ) {
                    continue;
                }

                // we're only checking j values that match jScan.  More specifically, we're
                // ensuring that for each jScan value, every corresponding j is greater than the northernmost latitude entered by the user
                if (jScan == currentJ && currentLatitude <= latitude) {
                    inDomain = false;
                    break;
                }
            }

            if (inDomain && jScan < maxJ) {
                maxJ = jScan;
            }
            
        }
        return (maxJ);
    }

    // calculate the largest I value less than the western boundary that the user selected, constrained by the norther/southern boundaries selected by the user
    async calculateMinimumI(longitude: number, maxJ: number): Promise<number> {
        var minI = 2;
        var previousLongitude = -200;

        for (var n = 0; n < linesNums.length; n++) {
            var currentLine = linesNums[n];
            var currentI = currentLine[0];
            var currentLongitude = currentLine[3];
            var currentJ = currentLine[1];

            if ((currentJ == maxJ) && (currentLongitude > previousLongitude) && (currentLongitude < longitude)) {
                previousLongitude = currentLongitude;
                minI = currentI;
            }
        }
        return minI;
    }

    // calculate the smallest I value greater than the eastern boundary that the user selected, constrained by the norther/southern boundaries selected by the user
    async calculateMaximumI(longitude: number, maxJ: number): Promise<number> {
        var maxI = 2;
        var previousLongitude = 200;

        for (var n = 0; n < linesNums.length; n++) {
            var currentLine = linesNums[n];
            var currentI = currentLine[0];
            var currentLongitude = currentLine[3]
            var currentJ = currentLine[1];

            if ((currentJ == maxJ) && (currentLongitude < previousLongitude) && (currentLongitude > longitude)) {
                            previousLongitude = currentLongitude;
                            maxI = currentI;
            }
        }
        
        return maxI;
    }
}
