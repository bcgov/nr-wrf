import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, map } from 'rxjs';
import { zipFiles } from '../../util/util'

let hostname: string;
let port: number;

@Injectable()
export class ZipFileService {
    constructor(private httpService: HttpService) {
        // docker hostname is the container name, use localhost for local development
        hostname = process.env.BACKEND_URL ? process.env.BACKEND_URL : `http://localhost`;
        // local development backend port is 3001, docker backend port is 3000
        // port = process.env.BACKEND_URL ? 3000 : 3001;
        port = 3000; // frontend = 8080, backend = 3000 for now
    }

    async calculateVars(bottomLeftYGlobal: number, topRightYGlobal: number, bottomLeftXGlobal: number, topRightXGlobal: number): Promise<any> {
        const requestUrl = `${hostname}:${port}/data`;
        const data = await lastValueFrom(
        this.httpService.post(requestUrl, { bottomLeftYGlobal, topRightYGlobal, bottomLeftXGlobal, topRightXGlobal}).pipe(map((response) => response.data))
        );
        return data;
    }

    async zipFiles(stitchingConfig: string, urls: string[]): Promise<any> {
        let count = 0;
        const files = [
        {data: Buffer.from(stitchingConfig), name: "m3d_bild.inp"}
        ]
        
        for (let url of urls) {
        count++;
        // add the zip file
        const data = await lastValueFrom(
            this.httpService.get(url).pipe(map((response) => response.data))
        );
        console.log("Downloading file from "+url);
        files.push({data: Buffer.from(data), name: (url.substring(url.lastIndexOf('/') + 1))})
        if (count == urls.length) {
            console.log("Returning zip file")
            return await zipFiles(files);
        }
        }
    }
}