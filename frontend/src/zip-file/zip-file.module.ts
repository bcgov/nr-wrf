import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ZipFileController } from './zip-file.controller';
import { ZipFileService } from './zip-file.service';
import { MappingService } from '../mapping/mapping.service';

@Module({
  imports: [HttpModule],
  controllers: [ZipFileController],
  providers: [ZipFileService, MappingService],
})
export class ZipFileModule {}
