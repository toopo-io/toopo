import { Injectable } from '@nestjs/common';
import type { HealthCheckResponse } from '@toopo/api-contracts';

const pkg = require('../../../package.json') as { version: string };
const PKG_VERSION = pkg.version;

@Injectable()
export class HealthService {
  report(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: PKG_VERSION,
    };
  }
}
