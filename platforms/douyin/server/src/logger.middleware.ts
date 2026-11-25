import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, query, headers } = req;
    const start = Date.now();

    const relevantHeaders = {
      'x-tt-openid': headers['x-tt-openid'],
      'x-dy-delegatetoken': headers['x-dy-delegatetoken'],
    };

    this.logger.log(`→ ${method} ${originalUrl} query=${JSON.stringify(query)} headers=${JSON.stringify(relevantHeaders)}`);

    res.on('finish', () => {
      const ms = Date.now() - start;
      const { statusCode } = res;
      const level = statusCode >= 400 ? 'error' : 'log';
      this.logger[level](`← ${method} ${originalUrl} ${statusCode} +${ms}ms`);
    });

    next();
  }
}
