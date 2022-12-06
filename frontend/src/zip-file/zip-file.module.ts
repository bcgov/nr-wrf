import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ZipFileController } from './zip-file.controller';
import { ZipFileService } from './zip-file.service';

@Module({
  imports: 
  [ 
    HttpModule,
  ],
  controllers: [ZipFileController],
  providers: [ZipFileService]
})
export class ZipFileModule {}
