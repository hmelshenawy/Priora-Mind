import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/** Health check — the single unauthenticated endpoint used by uptime probes. */
@Controller('health')
export class AppController {
  constructor(private readonly app: AppService) {}

  @Get()
  health() {
    return this.app.health();
  }
}