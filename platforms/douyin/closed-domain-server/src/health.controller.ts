import { Controller, Get } from '@nestjs/common';

@Controller('v1')
export class ClosedDomainHealthController {
  @Get('ping')
  ping(): string {
    return 'pong';
  }
}
