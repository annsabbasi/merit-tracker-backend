// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    // origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Merit Tracker API')
    .setDescription('Complete backend API for Merit Tracking Application')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('companies', 'Company management')
    .addTag('departments', 'Department management')
    .addTag('projects', 'Project management')
    .addTag('sub-projects', 'Task/Sub-project management')
    .addTag('time-tracking', 'Time tracking with cross-device sync')
    .addTag('sops', 'Standard Operating Procedures')
    .addTag('chat', 'Project chat rooms')
    .addTag('notifications', 'User notifications')
    .addTag('activity-logs', 'Activity audit logs')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // const port = process.env.PORT ?? 3000;
  // const port = 4000;
  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();