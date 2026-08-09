import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { startTelemetry } from './common/observability/otel';
import { validateEnv } from './common/config';

/**
 * Application bootstrap.
 *
 * Env is validated fail-closed before the Nest container is created (task T006).
 * OpenTelemetry auto-instrumentation starts only when an OTLP endpoint is
 * configured (task T010); spans carry no sensitive attributes by contract.
 * The global exception filter ensures no submitted payload is echoed back and
 * no sensitive context reaches the client (tasks T011, FR-030/FR-037).
 */
async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    startTelemetry(env.OTEL_SERVICE_NAME);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ credentials: true, origin: env.CORS_ORIGIN });
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(env.PORT || 3000);
  Logger.log(`Priora Mind backend listening on :${env.PORT}`, 'Bootstrap');
}

void bootstrap();