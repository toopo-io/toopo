/**
 * Owns the single shared connection for the whole API (ADR-0017 §1). Everything
 * comes from @toopo/db's surface — the object Better Auth's adapter expects, the
 * UserRepository, and a close function — so apps/api never names Kysely or the
 * persistence implementation. The backend (SQLite self-host / Postgres
 * cloud) is selected by the DATABASE_URL scheme inside `createAuthDatabase`.
 */
import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import {
  type AuthDatabaseHandle,
  type BetterAuthDatabase,
  createAuthDatabase,
  createGraphDatabase,
  createProjectDatabase,
  type GithubInstallationRepository,
  type GraphDatabaseHandle,
  type GraphRepository,
  type MembershipRepository,
  type ProjectDatabaseHandle,
  type ProjectRepository,
  type UserRepository,
} from '@toopo/db';
import { Env } from '../../env';

export const USER_REPOSITORY = Symbol.for('toopo.user-repository');
export const GRAPH_REPOSITORY = Symbol.for('toopo.graph-repository');
export const PROJECT_REPOSITORY = Symbol.for('toopo.project-repository');
export const MEMBERSHIP_REPOSITORY = Symbol.for('toopo.membership-repository');
export const GITHUB_INSTALLATION_REPOSITORY = Symbol.for('toopo.github-installation-repository');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly authHandle: AuthDatabaseHandle;
  private readonly graphHandle: GraphDatabaseHandle;
  private readonly projectHandle: ProjectDatabaseHandle;
  // The project and installation repositories share one connection (one schema
  // module, ADR-0026 §3), exposed through the same handle.

  constructor() {
    // One logical database, three schema modules (ADR-0017 §7, ADR-0022): the
    // auth handle backs Better Auth, the graph handle the read-only Serve API,
    // the project handle the tenancy entity. The backend is selected by the
    // DATABASE_URL scheme inside @toopo/db.
    this.authHandle = createAuthDatabase({ databaseUrl: Env.DATABASE_URL });
    this.graphHandle = createGraphDatabase({ databaseUrl: Env.DATABASE_URL });
    this.projectHandle = createProjectDatabase({ databaseUrl: Env.DATABASE_URL });
  }

  /** The `database` value passed straight to `betterAuth(...)`. */
  get betterAuthDatabase(): BetterAuthDatabase {
    return this.authHandle.betterAuthDatabase;
  }

  get userRepository(): UserRepository {
    return this.authHandle.userRepository;
  }

  /** Read seam over the organization plugin's `member` table (ADR-0028). */
  get membershipRepository(): MembershipRepository {
    return this.authHandle.membershipRepository;
  }

  /** The read-only code-graph repository backing the Serve API (ADR-0020). */
  get graphRepository(): GraphRepository {
    return this.graphHandle.graphRepository;
  }

  /** The project (tenancy) repository backing project listing + access control (ADR-0022). */
  get projectRepository(): ProjectRepository {
    return this.projectHandle.projectRepository;
  }

  /** The GitHub-App installation link store backing the connect flow (ADR-0026 §3). */
  get githubInstallationRepository(): GithubInstallationRepository {
    return this.projectHandle.githubInstallationRepository;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.authHandle.close(),
      this.graphHandle.close(),
      this.projectHandle.close(),
    ]);
  }
}

@Global()
@Module({
  providers: [
    DatabaseService,
    {
      provide: USER_REPOSITORY,
      useFactory: (database: DatabaseService): UserRepository => database.userRepository,
      inject: [DatabaseService],
    },
    {
      provide: GRAPH_REPOSITORY,
      useFactory: (database: DatabaseService): GraphRepository => database.graphRepository,
      inject: [DatabaseService],
    },
    {
      provide: PROJECT_REPOSITORY,
      useFactory: (database: DatabaseService): ProjectRepository => database.projectRepository,
      inject: [DatabaseService],
    },
    {
      provide: MEMBERSHIP_REPOSITORY,
      useFactory: (database: DatabaseService): MembershipRepository =>
        database.membershipRepository,
      inject: [DatabaseService],
    },
    {
      provide: GITHUB_INSTALLATION_REPOSITORY,
      useFactory: (database: DatabaseService): GithubInstallationRepository =>
        database.githubInstallationRepository,
      inject: [DatabaseService],
    },
  ],
  exports: [
    DatabaseService,
    USER_REPOSITORY,
    GRAPH_REPOSITORY,
    PROJECT_REPOSITORY,
    MEMBERSHIP_REPOSITORY,
    GITHUB_INSTALLATION_REPOSITORY,
  ],
})
export class DatabaseModule {}
