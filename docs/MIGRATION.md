# Incremental migration plan

This plan implements [the architecture](ARCHITECTURE.md). Each stage has a
finite deliverable and a decision gate. Do not move all files in one change.

## Stage 0 — Guidance and visibility

Deliverable: the root/scoped `AGENTS.md` files, architecture/development
documents, and read-only setup preflight in this package.

These files can be reviewed without changing application behavior. The
preflight deliberately reports the missing standalone environment. It is
not a new runtime or a substitute for build/test execution.

## Stage 1 — Reproduce the baseline

**Next executable engineering allocation:** recover or establish one
compatible pinned Harness fixture for the existing plugin.

| Task | Acceptance evidence |
| --- | --- |
| Recover original base, or evaluate one upstream candidate | Full Harness commit recorded; differences required by the extraction identified. |
| Integrate at the original package path | Workspace resolution, root source aliases, compiler inputs, and Typert membership are explicit. |
| Record the environment | Exact runtime/package-manager versions, lockfile/integration patch, and commands. |
| Build host/client and generated remotes | All declared public entry points resolve; images and Python worker exist at packaged paths. |
| Execute existing tests | All 23 baseline files discovered; actual results retained, including pre-existing failures. |
| Repeat a clean setup | The recorded recipe works without untracked files or locally generated leftovers. |

Bound the first investigation to the original base if recoverable, otherwise
the single documented upstream candidate. If neither can establish the
baseline, stop runtime reorganization and report the specific missing API,
generator, fixture, or build input. Do not search arbitrary versions or
replace workspace ranges speculatively.

Decision: continue with the DSH fixture when it passes. If independent
installation is the actual product requirement, write a separate packaging
decision covering runtime dependencies, build/generation, and test fixtures.

## Stage 2 — One representative command boundary

Use arrangement editing as the first small vertical change. It already
has a shared GUI/model entry path and clear state invariants.

1. Extract browser-safe domain types/schemas needed by arrangement planning.
2. Extract a pure planner with explicit time input.
3. Keep a DSH adapter that reads current state, plans, and appends without
   an asynchronous gap. Preserve the existing event payload.
4. Route the existing Remote method and tool through that same command.
5. Keep compatibility exports and update compiler/generator input paths.
6. Introduce import rules for the new domain boundary using the verified
   toolchain, with explicit temporary exemptions for unchanged legacy code.

Gate: existing stale-revision, collision, movement-stop, furniture-release,
and replay tests keep the same outcomes. Host/client builds and generated
Remote imports pass. No event-format change is part of this stage.

Applied in this checkout: the pure planner is at
`src/domain/home/arrangement.ts`, the synchronous Session adapter is at
`src/host/resident/arrangement.ts`, and `src/home-arrangement.ts` remains a
compatibility facade. Replay and event payloads are unchanged. Host compilation
passes; client compilation and five `jsdom` suites are blocked by the fixture
issues recorded in [development](DEVELOPMENT.md#7-verification-record).

Stop or reverse this patch if it changes old replay results, loses atomic
read/validate/append behavior, or needs a weaker assertion to pass. Correct
the boundary design before moving another feature.

## Stage 3 — Organize ownership, one feature at a time

Suggested review units:

| Unit | Scope | Required verification |
| --- | --- | --- |
| Resident/domain | Types, schemas, pure reducer, DSH projection adapter, tool adapters | Old records, same projection key/behavior, no replay effects. |
| Phone host | Existing service, worker client, protocol, tools | Existing serialization/uncertainty/drain tests; packaged worker lookup. |
| Memory host | Keep projection host-only; isolate delivery and tool wiring as useful | Existing durable queue, stable ID, lost-ack restart and binding tests. |
| Connections | Service/provider module boundary | Existing verification, expiry, cancellation, and redaction tests. |
| Client feature groups | Home/phone/connections/memory views, controllers, locales/styles | Existing controller/component tests and generated remote imports. |
| Client scene | Mount owner, drawing, resident rendering group | Geometry/pose tests, cleanup checks, affected visual frames. |

Keep images under `src/client/assets/` during these moves. Keep the public
host, client, and types entry points stable. Audit `./src/*` consumers before
removing old paths; retain compatibility facades where needed.

Every move includes imports, TypeScript input lists, test paths, generation
membership, and package-content checks. Separate moves from output or
behavior changes so failures are attributable.

Small confirmed duplication can be fixed separately: the Home editor should
read width/depth from shared geometry instead of repeating `10` and `8`.
This is a maintenance fix; the values currently agree.

## Stage 4 — Behavior improvements with independent decisions

### 4A. Memory blocked entries and backlog

First characterize two queued memories where the first has a permanent
failed/cancelled external status. Verify that current behavior leaves both
pending and keeps selecting the head.

Choose and document ordering semantics. If independent entries can proceed,
introduce durable blocked-entry state and visible recovery actions. Otherwise
make the paused queue explicit. Preserve source content, binding, IDs, and
prior outcomes. Never silently drop an accepted entry.

Then measure backlog growth and persistence cost under a defined offline
period. Choose an admission budget with an explicit full-queue result.
Granular enqueue/acknowledge events are a separate replay-format migration
only if the measurements justify replacing full-state checkpoints.

Gate: terminal failure, healthy later work, lost acknowledgement, restart,
capacity admission, and operator recovery all have explicit tested results.
No exactly-once claim without the pinned Hindsight contract evidence.

### 4B. Phone observation freshness

First reproduce a GUI and model action prepared from the same old screen.
If a guard is needed, define a versioned observation token and check it at
the front of the host queue. Specify passive-capture token semantics.

Gate: stale input is rejected before device dispatch; the current matching
request can execute once; periodic capture does not make ordinary control
unusable; uncertainty still requires explicit inspection. The guard must
not be described as protection against all independent Android UI changes.

### 4C. Policy and protocol verification

Trace model-tool and Remote authorization in the compatible DSH revision.
Use the actual policy hooks in tests. If enforcement is missing, add it at
the host boundary with a concrete action scope; do not substitute persona
wording. Account linkage alone must not grant sending/publishing permission.

Add TS/Python protocol fixtures and a pinned Python dependency environment
when changing that integration. Existing fake-process TS tests remain useful
but do not establish Python/library compatibility.

### 4D. Client lifecycle and timing

Add focused HomeController uncertainty/reconnection checks when changing it.
Verify scene cleanup on unmount and partial loading failure when changing
scene ownership. Inspect affected poses and viewport sizes for visual work.

Test a host/browser clock offset before adding synchronization. Profile
loading, frame time, and memory before optimizing assets or rendering.

## Stage 5 — Optional independent distribution

Start only for an explicit product need. A complete standalone release must
replace or package all four workspace dependencies:

1. Runtime packages and tested compatible versions.
2. TypeScript/bundler configuration and build tools.
3. Typert, locale, and asset generation.
4. Test helpers and runner transformation/configuration.

It must also provide a launcher/deployment recipe, package lock, license and
asset notices, integration tests, and a compatibility policy. A local
tsconfig or a renamed dependency range is not a standalone release.

## Review protocol for coding agents

At the start of a change, state the owned module, observable behavior, and
whether persisted/remote contracts change. Use the nearest guide and tests.
For independent work, assign disjoint file ownership and agree on shared
interfaces first. One integrator owns entry points, exported contracts, and
build configuration. Avoid concurrent edits to those files.

A review should answer:

- Which invariant could this change break, and what evidence addresses it?
- Does it preserve old history and external-operation uncertainty?
- Is an alleged improvement measured, or only a hypothesis?
- Did the real checks run, or is there a named environment blocker?
- Are generated artifacts, public exports, and resource paths coherent?

Stop optional testing after the required checks resolve the concrete risk.
Do not broaden the refactor merely because adjacent files could be cleaner.
