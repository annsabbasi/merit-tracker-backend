// src/modules/screenshots/screenshots.module.ts
import { Module } from '@nestjs/common';
import { ScreenshotsController } from './screenshots.controller';
import { ScreenshotsService } from './screenshots.service';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [StorageModule],
    controllers: [ScreenshotsController],
    providers: [ScreenshotsService],
    exports: [ScreenshotsService],
})
export class ScreenshotsModule { }