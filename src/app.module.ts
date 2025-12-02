// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SopsModule } from './modules/sops/sops.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT!) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'merit_tracker',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production', // Disable in production
      logging: process.env.NODE_ENV === 'development',
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    CompaniesModule,
    DepartmentsModule,
    ProjectsModule,
    SopsModule,
    TimeTrackingModule,
    NotificationsModule,
    ChatModule,
    AnalyticsModule,
  ],
})
export class AppModule { }