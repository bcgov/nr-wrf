import { Body, Controller, Get, Post } from '@nestjs/common';
import { MappingService } from './mapping.service';

@Controller('mapping')
export class MappingController {
  constructor(private readonly zipFileService: MappingService) {}
  @Post('findClosestPoint')
  async findClosestPoint(@Body() data: { latitude: number; longitude: number }): Promise<any> {
    return this.zipFileService.findClosestPoint(data.latitude, data.longitude);
  }

  @Post('calculateAermodTiles')
  async calculateAermodTiles(@Body() data: { latitude: number; longitude: number }): Promise<any> {
    return this.zipFileService.calculateAermodTiles(data.latitude, data.longitude);
  }

  @Get('getAermodTiles')
  getAermodTiles(): any {
    return this.zipFileService.getAermodTiles();
  }

  @Post('findClosestD02Tile')
  async findClosestD02Tile(@Body() data: { latitude: number; longitude: number }): Promise<any> {
    return this.zipFileService.findClosestD02Tile(data.latitude, data.longitude);
  }
}
