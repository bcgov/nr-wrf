import {
  Controller,
  Post,
  Body,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DataService } from "./data.service";

@ApiTags("data")
@Controller("data")
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Post()
  calculateVars(@Body() dataDto: {bottomLeftYGlobal: number, topRightYGlobal: number, bottomLeftXGlobal: number, topRightXGlobal: number}) {
    return this.dataService.calculateVars(dataDto.bottomLeftYGlobal, dataDto.topRightYGlobal, dataDto.bottomLeftXGlobal, dataDto.topRightXGlobal);
  }
}
