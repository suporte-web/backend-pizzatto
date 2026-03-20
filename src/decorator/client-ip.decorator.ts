import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();

    const forwarded = req.headers['x-forwarded-for'] as string | undefined;
    const ip =
      (forwarded?.split(',')[0] ??
        req.ip ??
        req.socket.remoteAddress ??
        '').trim();

    return ip;
  },
);
