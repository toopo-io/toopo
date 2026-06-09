import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { Env } from './env';
import { I18nService } from './i18n/i18n.service';
import { registerAuthRoute } from './modules/auth/auth.fastify-bridge';
import { AUTH_INSTANCE, type Auth } from './modules/auth/auth.module';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    genReqId: (req: IncomingMessage) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }
      return randomUUID();
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableCors({
    origin: Env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false,
  });

  const auth = app.get<Auth>(AUTH_INSTANCE);
  const i18n = app.get(I18nService);
  const fastify = app.getHttpAdapter().getInstance();
  registerAuthRoute({ fastify, auth, logger, i18n, portFallback: Env.PORT });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Toopo API')
    .setDescription('Toopo platform API')
    .setVersion('0.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document));

  await app.listen(Env.PORT, '0.0.0.0');
  logger.log(`API listening on port ${Env.PORT}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap', error);
  process.exit(1);
});
