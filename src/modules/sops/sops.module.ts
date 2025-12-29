// src/modules/sops/sops.module.ts
import { Module } from '@nestjs/common';
import { SopsController } from './sops.controller';
import { SopsService } from './sops.service';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [StorageModule],
    controllers: [SopsController],
    providers: [SopsService],
    exports: [SopsService],
})
export class SopsModule { }