// src/modules/storage/storage.module.ts
import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Global()
@Module({
    imports: [ConfigModule],
    controllers: [StorageController],
    providers: [StorageService],
    exports: [StorageService],
})
export class StorageModule implements OnModuleInit {
    constructor(private storageService: StorageService) { }

    async onModuleInit() {
        // Initialize bucket on module startup
        await this.storageService.initializeBucket();
    }
}