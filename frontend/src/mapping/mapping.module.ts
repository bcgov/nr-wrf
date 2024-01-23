import { Module } from '@nestjs/common';
import { MappingService } from './mapping.service';
import { MappingController } from './mapping.controller';

@Module({
  providers: [MappingService],
  controllers: [MappingController]
})
export class MappingModule {}
