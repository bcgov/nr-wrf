import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataService } from './data.service';

// =============================================================================
// DataController
//
// Exposes two POST endpoints — one per tab on the web application.
//
// Tab 1 — CALPUFF:  POST /data
//   Accepts a lat/lon bounding box (from a point+distance or drawn rectangle).
//   Uses the original lat/lon overlap algorithm to find matching CALPUFF tiles.
//   Returns the min/max I/J grid index range for the best-fit WRF domain.
//
// Tab 2 — AERMOD:   POST /data/calculateAermodTiles
//   Accepts a single lat/lon point entered by the user (no radius needed).
//   Uses the LCC projection to find:
//     - The coarse d02 tile containing the point (always returned).
//     - The high-res tile (d03–d06) containing the point (if applicable).
//   Returns { domain, tiles[] } matching the original response format.
//
//   Request fields use "latitude" and "longitude" to match the frontend.
// =============================================================================

@ApiTags('data')
@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  // ===========================================================================
  // Tab 1 — CALPUFF
  // POST /data
  //
  // Request body:
  //   bottomLeftYGlobal  — south latitude  of the bounding box
  //   topRightYGlobal    — north latitude  of the bounding box
  //   bottomLeftXGlobal  — west longitude  of the bounding box
  //   topRightXGlobal    — east longitude  of the bounding box
  //
  // Response: { domain, minI, maxI, minJ, maxJ }
  // ===========================================================================
  @Post()
  calculateVars(
    @Body()
    dataDto: {
      bottomLeftYGlobal: number;
      topRightYGlobal: number;
      bottomLeftXGlobal: number;
      topRightXGlobal: number;
    },
  ) {
    return this.dataService.calculateVars(
      dataDto.bottomLeftYGlobal,
      dataDto.topRightYGlobal,
      dataDto.bottomLeftXGlobal,
      dataDto.topRightXGlobal,
    );
  }

  // ===========================================================================
  // Tab 2 — AERMOD
  // POST /data/calculateAermodTiles
  //
  // Request body:
  //   latitude   — latitude  of the project location (degrees N)
  //   longitude  — longitude of the project location (degrees E, -180..180)
  //
  // Response: array of { domain, tiles[] }, d02 first then high-res if applicable:
  //   [
  //     { domain: 'd02', tiles: [187] },          // always present
  //     { domain: 'd04', tiles: [12]  }           // only if location is within d04
  //   ]
  //
  // tiles[] contains a single tile ID — the one tile that contains the point.
  // The array format matches the original response structure.
  // ===========================================================================
  @Post('calculateAermodTiles')
  findAermodTilesAtPoint(
    @Body()
    dataDto: {
      latitude: number;
      longitude: number;
    },
  ) {
    return this.dataService.findAermodTilesAtPoint(
      dataDto.latitude,
      dataDto.longitude,
    );
  }
}
