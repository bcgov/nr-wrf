import { Body, Controller, Get, Post } from "@nestjs/common";
import { MappingService } from "./mapping.service";

@Controller("mapping")
export class MappingController {
  constructor(private readonly zipFileService: MappingService) {}
  @Post("findClosestPoint")
  async findClosestPoint(
    @Body() data: { latitude: number; longitude: number }
  ): Promise<any> {
    return this.zipFileService.findClosestPoint(data.latitude, data.longitude);
  }

  @Get("getCornerPoints")
  getCornerPoints(): any {
    return this.zipFileService.getCornerPoints();
  }
}
