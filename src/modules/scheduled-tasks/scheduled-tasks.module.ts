// src/modules/scheduled-tasks/scheduled-tasks.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { ScreenshotsModule } from '../screenshots/screenshots.module';
import { DesktopAgentModule } from '../desktop-agent/desktop-agent.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        ScreenshotsModule,
        DesktopAgentModule,
    ],
    providers: [ScheduledTasksService],
    exports: [ScheduledTasksService],
})
export class ScheduledTasksModule { }