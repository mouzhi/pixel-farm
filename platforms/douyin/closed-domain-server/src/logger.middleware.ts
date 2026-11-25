import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: any, res: any, next: () => void) {
    const { method, query, headers } = req;
    // 通配中间件中的 req.path 可能只剩 /，使用原始 URL 保留完整路径。
    const path = (req.originalUrl || req.url || req.path || '').split('?')[0];
    const start = Date.now();

    const metadata = {
      queryKeys: Object.keys(query || {}),
      headers: {
        hasOpenId: Boolean(headers['x-tt-openid']),
        hasDelegateToken: Boolean(headers['x-dy-delegatetoken']),
        closedDomain: headers['x-closed-domain'],
      },
    };

    this.logger.log(`→ ${method} ${path} metadata=${JSON.stringify(metadata)}`);

    res.on('finish', () => {
      const ms = Date.now() - start;
      const { statusCode } = res;
      const level = statusCode >= 400 ? 'error' : 'log';
      this.logger[level](`← ${method} ${path} ${statusCode} +${ms}ms`);
    });

    next();
  }
}
