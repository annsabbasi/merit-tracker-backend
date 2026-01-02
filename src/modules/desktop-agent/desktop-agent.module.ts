// src/modules/desktop-agent/desktop-agent.module.ts
import { Module } from '@nestjs/common';
import { DesktopAgentController } from './desktop-agent.controller';
import { DesktopAgentService } from './desktop-agent.service';

@Module({
    controllers: [DesktopAgentController],
    providers: [DesktopAgentService],
    exports: [DesktopAgentService],
})
export class DesktopAgentModule { }