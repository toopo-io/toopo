/**
 * The project tenancy + access-control module (ADR-0022). Exposes the read-only
 * project API (list/get) and the {@link ProjectAccessGuard} that the GraphModule
 * reuses to scope and authorize `:projectId`. The PROJECT_REPOSITORY comes from
 * the global DatabaseModule; the SessionGuard from the UserModule.
 */
import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { ProjectController } from './project.controller';
import { ProjectAccessGuard } from './project-access.guard';

@Module({
  imports: [UserModule],
  controllers: [ProjectController],
  providers: [ProjectAccessGuard],
  exports: [ProjectAccessGuard],
})
export class ProjectModule {}
