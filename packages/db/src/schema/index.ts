// biome-ignore lint/performance/noBarrelFile: Better Auth's drizzleAdapter consumes the schema as a single `* as schema` object; this barrel is the single source for that import.
export { account, session, user, verification } from './auth.js';
