import { Body, Controller, Get, Param, Post, StreamableFile } from '@nestjs/common';
import { ZipFileService } from './zip-file.service';
import { TileDownloadInfo } from '../../util/types';

@Controller('zip-file')
export class ZipFileController {
  constructor(private readonly zipFileService: ZipFileService) {}

  @Post('calculateVars')
  async calculateVars(
    @Body()
    dataDto: {
      bottomLeftYGlobal: number;
      topRightYGlobal: number;
      bottomLeftXGlobal: number;
      topRightXGlobal: number;
    }
  ) {
    console.log(dataDto);
    const vars = await this.zipFileService.calculateVars(
      dataDto.bottomLeftYGlobal,
      dataDto.topRightYGlobal,
      dataDto.bottomLeftXGlobal,
      dataDto.topRightXGlobal
    );
    return vars;
  }

  @Post('zipSearch')
  async beginZippingFromBounds(
    @Body()
    dataDto: {
      bottomLeftYGlobal: number;
      topRightYGlobal: number;
      bottomLeftXGlobal: number;
      topRightXGlobal: number;
      timezoneOffsetHours: number;
      startDateIso: string;
      endDateIso: string;
    }
  ): Promise<{ subFolder: string }> {
    return this.zipFileService.beginZippingFromBounds(dataDto);
  }

  @Post('zipAermod')
  async beginZippingAermod(
    @Body()
    dataDto: {
      tileDownloadInfo: TileDownloadInfo;
      urls: string[];
    }
  ): Promise<{ subFolder: string }> {
    return this.zipFileService.beginZippingAermod(dataDto.tileDownloadInfo, dataDto.urls);
  }

  @Post('zipAermodFromCoords')
  async beginZippingAermodFromCoords(
    @Body()
    dataDto: {
      latitude: number;
      longitude: number;
      startDateIso: string;
      endDateIso: string;
      timezoneOffsetHours: number;
      domain: string;
    }
  ): Promise<{ subFolder: string }> {
    return this.zipFileService.beginZippingAermodFromCoords(dataDto);
  }

  @Get('checkZipFile/:uuid')
  checkZipFile(@Param('uuid') uuid: string): {
    status: string;
    num: string;
  } {
    return this.zipFileService.checkZipFile(uuid);
  }

  @Get('zipDownload/:uuid')
  async zipDownload(@Param('uuid') uuid: string): Promise<StreamableFile> {
    return new StreamableFile(await this.zipFileService.serveZipFile(uuid));
  }
}
