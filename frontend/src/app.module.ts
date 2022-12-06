import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';
import { ZipFileModule } from './zip-file/zip-file.module';

@Module({
  imports: 
  [ 
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api*'],
    }),
    HttpModule,
    ZipFileModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
