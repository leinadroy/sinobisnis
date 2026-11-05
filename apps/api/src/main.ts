import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.WEB_ORIGIN || 'http://localhost:3001').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const doc = new DocumentBuilder()
    .setTitle('Sinobisnis API')
    .setDescription('REST API aplikasi Sinobisnis (Smlgroupid)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));

  const port = Number(process.env.PORT ?? 4000);
  // HOST=127.0.0.1 di server: API hanya bisa diakses dari mesin itu sendiri (browser selalu lewat web/BFF).
  const host = process.env.HOST?.trim() || undefined;
  if (host) await app.listen(port, host);
  else await app.listen(port);
  console.log(`API berjalan di http://${host ?? 'localhost'}:${port}/api (Swagger: /api/docs)`);
}
await bootstrap();
