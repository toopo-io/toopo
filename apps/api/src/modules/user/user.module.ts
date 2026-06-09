import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from './session.guard';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [SessionGuard, UserService],
})
export class UserModule {}
