# Agent development guide

## Project and scope

Virtual Live is one DSH Harness plugin. It owns one persistent resident, an
illustrated home, optional Android control, optional Hindsight memory, and
account connection settings. Keep this product boundary during routine work.

This checkout was extracted from a larger workspace. Read
[development setup](docs/DEVELOPMENT.md) before choosing install, build, or
test commands. The package currently declares only `bundle` and `watch`.

## Start here

1. Read this file, the nearest scoped `AGENTS.md`, the affected source, and
   its existing tests. Check the working tree before editing.
2. Use [the architecture](docs/ARCHITECTURE.md) to identify the owner of the
   behavior. The arrangement paths are applied; the remaining target
   directories are proposals.
3. Identify changes to persisted records, remote contracts, phone input,
   credentials, lifecycle ownership, or artwork before implementing them.
4. Make the smallest complete change. Follow [the migration plan](docs/MIGRATION.md)
   for structural work. Do not combine a directory move with an event-format
   change or a new retry policy.

## Current source map

| Area | Current entry points |
| --- | --- |
| Resident lifetime and remote API | `src/index.ts` |
| Host resident commands | `src/host/resident/` |
| Durable resident records and projection | `src/types.ts`, `src/state.ts` |
| Home rules and arrangement writes | `src/home-*.ts`, `src/domain/home/`, `src/furniture-tools.ts` |
| Resident persona and tools | `src/persona.ts`, `src/resident-tools.ts` |
| Android service and worker protocol | `src/phone*.ts`, `assets/phone-worker.py` |
| Memory delivery and projection | `src/memory*.ts` |
| Account setup and credentials | `src/connections*.ts`, `src/bilibili-connection.ts` |
| Browser controllers, views, rendering | `src/client/` |

## Required invariants

- DSH Session records are authoritative resident history. Replay must not
  contact a network service, start a process, or perform a phone action.
- Keep host-only dependencies out of browser code. Keep DOM, React, and
  render resources out of shared rules. Keep the furniture catalog and
  geometry as one source for both validation and rendering.
- Preserve valid old records, projection keys, event names, and public
  exports during structural changes. Version data changes deliberately.
  A projection version bump alone is not a migration for old log records.
- Keep arrangement revision checks, collision checks, and the append in
  one serialized write section. GUI and model tools must use the same rules.
- Route all phone operations through the host queue. Never automatically
  repeat a mutation whose outcome is uncertain. Require successful explicit
  inspection before resuming input after uncertainty.
- Persist accepted memory work before delivery. Preserve its operation ID
  and destination binding across retries. Acknowledge only confirmed
  completion. Never silently discard accepted pending work.
- Keep credentials and QR polling keys out of snapshots, Session records,
  model inputs, tool results, and diagnostics.
- Use the verified DSH authorization path for external effects. Persona
  text and this guide do not enforce runtime permissions.
- Give each stream, timer, listener, image load, GPU resource, and child
  process one owner. Disposal stops admission and drains owned work.
- Distinguish a recorded intention, accepted request, fresh observation,
  durable acknowledgement, and externally confirmed result.

## Implementation and verification

- Preserve `src/index.ts`, `src/client/index.ts`, and `src/types.ts` as public
  entry points. Audit the `./src/*` export before removing old source paths.
- Update TypeScript input lists, imports, generated Remote inputs, tests,
  and package contents together when moving code. Do not edit generated
  `lib/typert.*` files by hand.
- Introduce an interface when it isolates an actual effect or permits a
  useful deterministic test. Avoid a generic service bus or an interface
  for every class.
- Reuse relevant existing tests. Add tests for changed behavior or a
  concrete uncovered failure. Keep real Android, model, and Hindsight
  integration checks separate from default tests.
- Run `node scripts/architecture-preflight.mjs` to inspect setup. A blocked
  result is not a passing build. Use only commands verified in the selected
  Harness revision for further checks.
- Report the change, its purpose, checks run, checks blocked, and remaining
  uncertainty. Do not claim graphics, device, or service behavior was
  verified by a source review or a mocked test.
- Preserve English/Chinese UI meaning and artwork provenance. The README
  describes separate licensing conditions for code and character artwork.

## Scoped guidance

- [Shared and host code](src/AGENTS.md)
- [Browser code](src/client/AGENTS.md)
- [Tests](tests/AGENTS.md)
- [Packaged assets and Python worker](assets/AGENTS.md)
