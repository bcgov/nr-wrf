import { Body, Controller, Post, StreamableFile } from "@nestjs/common";
import { ZipFileService } from "./zip-file.service";

@Controller("zip-file")
export class ZipFileController {
  constructor(private readonly zipFileService: ZipFileService) {}

  @Post("calculateVars")
  async calculateVars(
    @Body()
    dataDto: {
      bottomLeftYGlobal: number;
      topRightYGlobal: number;
      bottomLeftXGlobal: number;
      topRightXGlobal: number;
    }
  ) {
    const vars = await this.zipFileService.calculateVars(
      dataDto.bottomLeftYGlobal,
      dataDto.topRightYGlobal,
      dataDto.bottomLeftXGlobal,
      dataDto.topRightXGlobal
    );
    return vars;
  }

  @Post("zip")
  async zipFiles(
    @Body() dataDto: { stitchingConfig: string; urls: string[] }
  ): Promise<StreamableFile> {
    return new StreamableFile(
      await this.zipFileService.zipFiles2(dataDto.stitchingConfig, dataDto.urls)
    );
  }
}
