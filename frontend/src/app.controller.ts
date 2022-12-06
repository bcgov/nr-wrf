/* eslint-disable no-useless-constructor */
import { Render } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common'
require('dotenv').config();

@Controller()
export class AppController {
  @Get()
  @Render('index')
  async root() {}

  @Get('esriConfig')
  async esriConfig() {
    return process.env.esriConfigApiKey;
  }
}
