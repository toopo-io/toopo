import { Global, Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';

@Global()
@Module({
  imports: [ConfigModule, AppLoggerModule],
  exports: [ConfigModule, AppLoggerModule],
})
export class CoreModule {}
