import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Env } from '../../env';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: Env.LOG_LEVEL,
        ...(Env.NODE_ENV === 'development'
          ? {
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: false,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname',
                },
              },
            }
          : {}),
        customProps: (req) => ({ requestId: req.id }),
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
