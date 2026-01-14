// src/app.module.ts
// UPDATED VERSION - Removed SupabaseModule (use StorageModule instead)
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
// REMOVED: import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SubProjectsModule } from './modules/sub-projects/sub-projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { SopsModule } from './modules/sops/sops.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { StorageModule } from './modules/storage/storage.module';
import { SubscriptionGuard } from './modules/auth/guards';
import { ScreenshotsModule } from './modules/screenshots/screenshots.module';
import { DesktopAgentModule } from './modules/desktop-agent/desktop-agent.module';
import { ScheduledTasksModule } from './modules/scheduled-tasks/scheduled-tasks.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // REMOVED: SupabaseModule - Use StorageModule instead
    StorageModule,  // This handles all Supabase storage operations
    EmailModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    DepartmentsModule,
    ProjectsModule,
    SubProjectsModule,
    TasksModule,
    TimeTrackingModule,
    SopsModule,
    ChatModule,
    NotificationsModule,
    ActivityLogsModule,
    // Screen Capture modules
    ScreenshotsModule,
    DesktopAgentModule,
    ScheduledTasksModule,
    // Leaderboard and performance tracking
    LeaderboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
})
export class AppModule { }