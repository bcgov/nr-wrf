import { Module } from "@nestjs/common";
import { DataService } from "./data.service";
import { DataController } from "./data.controller";
import { DomainProjectionConfig } from "./domain-projection.config";

// DomainProjectionConfig must be listed as a provider so NestJS can inject
// it into DataService. It reads domain_projection.csv at startup and supplies
// the LCC projection parameters for each WRF domain.
// It is used only by the AERMOD tab (findAermodTilesAtPoint).
@Module({
  controllers: [DataController],
  providers: [DomainProjectionConfig, DataService],
})
export class DataModule {}
