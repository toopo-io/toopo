import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from './session.guard';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [SessionGuard, UserService],
  // Exported so the project + graph modules can guard their routes with the
  // same session check (ADR-0022 §5 — the graph API behind the session guard).
  // AuthModule is re-exported so the exported SessionGuard's AUTH_INSTANCE
  // dependency resolves in the importing module's context.
  exports: [SessionGuard, UserService, AuthModule],
})
export class UserModule {}
