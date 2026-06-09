# ADR 0019: Licensing — AGPL-3.0-or-later

Date: 2026-06-08
Status: Accepted

## Context

Toopo's constitution (CLAUDE.md) promises the project is **100% open source
and fully self-hostable**, with the free/paid line drawn at the deterministic
(free) / calibrated-hosted-AI (paid) boundary — billing and hosted-only code
never live in this repo. The repository was forked from an earlier product
that carried an MIT license; that license must be reconciled with two
standing goals that MIT cannot serve:

1. The promise of *genuine* OSI open source — not source-available.
2. An anti-free-rider stance: a competitor must not be able to take Toopo,
   improve it, and offer the result as a closed network service while giving
   nothing back.

The copyright holder also intends to keep a future hosted cloud and the
option of commercial licensing open.

## Decision

1. **License: `AGPL-3.0-or-later`** (GNU Affero General Public License v3.0
   or, at the licensee's option, any later version). Copyright holder:
   **Mathis Perron**, 2026.
2. `LICENSE` carries the verbatim FSF AGPL-3.0 text, preceded by the standard
   "how to apply" notice filled in with the project name, the
   `Copyright (C) 2026 Mathis Perron` line, and the *or-later* grant.
3. The SPDX `license` field reads `AGPL-3.0-or-later` in the root manifest and
   in every workspace manifest that declares a license (`apps/api`,
   `apps/web`).
4. All public license references (README) are aligned; no MIT or mixed-license
   reference remains in the repository.

## Consequences

- **Network copyleft (AGPL §13)** is the core gain: anyone offering a modified
  Toopo over a network must release their modifications under the same terms.
  This directly serves the anti-free-rider goal.
- **Dual-licensing stays open.** AGPL binds licensees, not the rights-holder,
  so the copyright holder can still grant commercial licenses and run the
  hosted cloud on separate terms.
- **Adoption cost (accepted):** some enterprises blanket-ban AGPL. This is a
  deliberate, accepted trade-off, mitigable later via commercial licensing —
  it does not change the open-source baseline.
- **Required future follow-up (not built now):** before accepting any outside
  contribution, adopt a CLA or a DCO with relicensing terms so the
  dual-licensing option is preserved once external contributors arrive. No
  contributor agreement and no third-party contributions exist today; this is
  recorded as a gate, to be implemented in its own change before the first
  external PR is merged.
- **Dependency compatibility:** every current direct dependency is permissive
  (MIT / Apache-2.0), all one-way compatible into AGPL-3.0 distribution. New
  dependencies must be checked against AGPL-3.0 compatibility before adoption.

## Alternatives considered

- **Permissive (MIT / Apache-2.0).** Rejected: lets a competitor host a
  modified Toopo without contributing anything back — the exact outcome the
  project exists to prevent.
- **Source-available (BSL / SSPL).** Rejected: not OSI-approved open source,
  which would break the constitution's "100% open source" promise.

## Related ADRs

- None supersedes or is superseded; this ADR is additive. It governs the
  whole repository and is referenced by CLAUDE.md's open-source-first mandate.
