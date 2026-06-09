/**
 * Better Auth canonical schema, manually transcribed from official docs.
 * Reference: https://better-auth.com/docs/adapters/drizzle (v1.6.x)
 * Current pinned version: better-auth@~1.6.11
 *
 * MAINTENANCE REQUIREMENT:
 * Before upgrading better-auth (especially minor versions like 1.6 -> 1.7),
 * verify this schema still matches the latest official documentation.
 * Mismatches will cause silent authentication failures at runtime.
 * See ADR-0012 §"Updating better-auth checklist" for the upgrade procedure.
 *
 * Custom extensions beyond the canonical schema:
 * - user.deletedAt: RGPD soft-delete, hard-deleted by a scheduled job after
 *   30 days. See ADR-0013 (RGPD compliance) for the lifecycle.
 *
 * Preserved upstream asymmetry:
 * - session.updatedAt and account.updatedAt have NO DB default (only the
 *   Drizzle-side $onUpdate). Better Auth always supplies updatedAt on
 *   insert. Adding a default would mask Better Auth bugs.
 * - user.updatedAt and verification.updatedAt DO have defaultNow().
 */
import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('user_deleted_at_idx').on(table.deletedAt)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
