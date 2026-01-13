// src/modules/desktop-agent/desktop-agent.module.ts
import { Module } from '@nestjs/common';
import { DesktopAgentController } from './desktop-agent.controller';
import { DesktopAgentService } from './desktop-agent.service';
import { DesktopAgentApiController } from './desktop-agent-api.controller';
import { DesktopAgentApiService } from './desktop-agent-api.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [PrismaModule, StorageModule],
    controllers: [DesktopAgentController, DesktopAgentApiController],
    providers: [DesktopAgentService, DesktopAgentApiService],
    exports: [DesktopAgentService, DesktopAgentApiService],
})
export class DesktopAgentModule { }