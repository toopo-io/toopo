/**
 * The tenancy scope of every graph read and write (ADR-0022 §3): the project a
 * query is partitioned to. It is the MANDATORY first parameter of every
 * {@link GraphRepository} method, so a graph access can never omit its tenant —
 * cross-project isolation is enforced by the type system, beneath the API guard
 * (defense-in-depth). An object (not a bare `projectId`) so a future tenancy
 * dimension is added in one place without re-churning every signature.
 */
export interface GraphScope {
  /** The project (a connected repo, ADR-0022 §1) every node/edge is keyed by. */
  readonly projectId: string;
}
