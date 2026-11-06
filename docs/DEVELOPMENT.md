# Reproducible development

Status: setup design, inspected command references, and a separate fixture
verification record. The standalone checkout was not installed; section 7
records what ran in a compatible Harness worktree and what remained blocked.

## 1. Current checkout

Reviewed plugin revision:
`4a3098eb148507e3a66ec39d9ed5cc432c410ccb`.

The package is a source extraction from
`packages/experimental/dsh-virtuallive` in DSH Harness. The following inputs
still live outside this repository:

- Workspace dependencies declared in `package.json`.
- `../../../tsconfig.base.json` and `../../../tsconfig.base.client.json`.
- Sibling project references in the host and client TypeScript configs.
- `../../client/tsdown.client.ts`, used by the bundler configuration.
- Agent-loop and credentials test fixtures imported by some host tests.
- The root toolchain, lockfile, Typert generation and test configuration.

The package itself currently declares these commands only:

| Script | Declared implementation | Limit |
| --- | --- | --- |
| `bundle` | `tsdown` | Relies on Harness tooling and prior generated/emitted inputs. |
| `watch` | `tsdown --watch` | Has the same environment dependencies. |

Do not present a package-local `npm test`, `npm run build`, or `npm run
typecheck` as an existing command.

## 2. Read-only preflight

From this repository root:

```sh
node scripts/architecture-preflight.mjs
node scripts/architecture-preflight.mjs --json
```

The script inspects referenced configs, the bundler helper, sibling test
fixtures, and the proposed compatible-environment record. It also lists
missing generated artifacts. It does not install anything, run commands
from a manifest, contact a service, or modify the checkout.

- Exit `2`: setup is blocked by missing prerequisites or an absent pin.
- Exit `0`: inspected paths and pin fields are present. This is **not**
  proof that installation, compilation, tests, or runtime behavior pass.
- Exit `1`: invalid invocation or an inspection error.

Generated artifacts are expected to be absent before a build. They are
reported separately and do not by themselves block a pre-build inspection.
This tool is a setup inventory, not a complete TypeScript dependency analyzer.

## 3. Upstream candidate inspected

The reviewed upstream candidate is
[`deepseek-ai/deepseek-harness@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`](https://github.com/deepseek-ai/deepseek-harness/tree/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159).
Its root manifest declares `pnpm@11.28.5` and Node `>=24.9.0`.

That revision does **not** contain `packages/experimental/dsh-virtuallive`.
It is a candidate to investigate, not a confirmed compatible pin. The
extracted repository does not identify its original compatible Harness
base commit. Its initial commit refers to a local feature branch.

### Commands confirmed in that upstream source

Run these at a properly integrated Harness root, not this extracted root.
The table confirms declarations and intended roles, not successful execution.

| Command | Role |
| --- | --- |
| `pnpm run typecheck` | Generate Typert declarations, compile package projects, check aggregate host/client programs without bundling. |
| `pnpm run build:artifacts` | Generate and emit build artifacts, host/client bundles, and Web output. |
| `pnpm run build:check` | Check aggregate programs against declarations already on disk. |
| `pnpm run build` | Run artifact and checking phases as a dependency graph. |
| `pnpm run test` | Build the native system prerequisite, then run Vitest. |
| `pnpm run test:coverage` | Run the corresponding coverage lane after its native prerequisite. |

The root test configuration provides source resolution and standard
decorator transformation. Installing Vitest inside this package alone does
not reproduce those semantics.

Sources: [root manifest](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/package.json),
[build driver](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/scripts/build.ts),
[test configuration](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/vitest.config.ts),
[client bundler](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/tsdown.client.ts).

## 4. Establish the compatible fixture

1. Recover the original local branch's base revision, or evaluate the
   inspected candidate in a disposable checkout. Record the exact commit.
2. Place this plugin at `packages/experimental/dsh-virtuallive`. Use a
   deliberate worktree/submodule/copy workflow that preserves the expected
   relative paths. An arbitrary symlink outside the tree is not sufficient
   evidence of correct resolution.
3. Establish workspace membership, root source aliases, compiler references,
   Typert generation membership, and host/client build inputs.
4. Integrate the plugin's lockfile importer and dependencies as a reviewed
   setup change. The original upstream lockfile cannot be assumed to contain
   this absent package. Record any required root integration patch.
5. Verify generated `./typert` and `./remote` exports, browser asset imports,
   Python worker packaging, and source/bundle resource resolution.
6. Confirm discovery and execution of every baseline test file (23 before
   this change; 24 including the arrangement test). Diagnose pre-existing
   failures separately; do not weaken them to create a baseline.
7. Repeat from a clean disposable checkout using only recorded inputs.
   Then commit the environment record and exact successful commands.

A later `dev/harness.lock.json` should use this shape. Nulls here are
deliberate unknowns, not a usable lock. Do not create a passing-looking
record before the integration is verified.

```json
{
  "schemaVersion": 1,
  "repository": "https://github.com/deepseek-ai/deepseek-harness.git",
  "commit": null,
  "packagePath": "packages/experimental/dsh-virtuallive",
  "nodeVersion": null,
  "packageManager": null,
  "pluginCommit": "4a3098eb148507e3a66ec39d9ed5cc432c410ccb",
  "integrationPatchSha256": null,
  "verifiedCommands": []
}
```

If a root integration patch is necessary, keep it versioned and pin its
digest. If none is needed, record that explicitly. A commit string and path
existence alone do not establish compatibility; retain the validation log.

### Target workflow after the fixture is verified

This is a proposed sequence, not a claim that it already runs:

```sh
# Run at the compatible, pinned Harness root after plugin integration.
pnpm install --frozen-lockfile
pnpm run build:artifacts
pnpm run build:check
pnpm exec vitest run packages/experimental/dsh-virtuallive/tests
```

The first integration may need a reviewed lockfile update before frozen
installs can succeed. Do not silently drop the frozen requirement in CI.
The focused Vitest path matches upstream's test inventory; verify actual
discovery before calling it complete. `typecheck` is useful for type-only
feedback and does not replace a bundle or asset check.

The inspected upstream coverage lane has per-file 100% thresholds with
declared exclusions. If adopting that lane, preserve its actual policy and
report the result; this review did not determine whether this plugin passes.

## 5. CI and external integration

First establish the fixture, then encode the verified sequence in CI.
Do not add a workflow that advertises green builds while skipping unknown
setup requirements.

Default checks should use deterministic model, phone, memory, and account
fakes. Keep real Android/Hindsight/provider checks explicit and separate.
For the Python worker, record the interpreter and compatible mobile-control
dependencies. Pin a tested Hindsight server when relying on its recovery
contract. Version declarations alone are not integration evidence.

Before publishing a package, inspect the assembled contents against every
declared export and required asset. Check worker path resolution in the
packaged runtime: moving `phone-worker.ts` changes source-relative paths,
while bundling may change `import.meta.url` again.

## 6. Evidence from the design review

- Repository source, configs, and test intent were inspected at the pinned
  plugin revision.
- Selected upstream tooling was inspected at the pinned candidate revision.
- At review time, only guidance, design documents, and the read-only preflight
  were added; the production refactor had not started.
- No model calls, Android actions, Hindsight requests, or account operations
  were performed for that review.

## 7. Verification record

This record covers the arrangement-boundary change in this checkout. It is not
a claim that the whole plugin baseline is green.

Fixture: a clean DSH Harness worktree at
`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`, with this package copied to
`packages/experimental/dsh-virtuallive`. Node `24.19.0`, pnpm `11.28.5`.
The root fixture adds the package paths and project references, plus the
`api-session/resolve-agent` waterfall event and the consumer that asks a
dedicated owner before resuming an ordinary Session. That API change is kept
in [`dev/api-session-resolve-agent.patch`](../dev/api-session-resolve-agent.patch)
so the integration can be reproduced; the patch is outside this repository's
runtime.

| Check | Result |
| --- | --- |
| `corepack pnpm install --no-frozen-lockfile` | Completed for 388 workspace projects after clearing an inherited worktree `core.hooksPath`. |
| `corepack pnpm exec vitest run packages/experimental/dsh-virtuallive/tests` | Before the new arrangement test file: 18 of 23 files passed; 105 tests passed. Five suites with the `jsdom` pragma failed to load with `ERR_UNKNOWN_BUILTIN_MODULE` before running tests. |
| Focused arrangement, interaction, state, and geometry tests | 4 files and 36 tests passed, including 7 new planner/adapter tests. The new domain and host arrangement files report 100% statements, branches, functions, and lines. |
| `corepack pnpm exec tsx scripts/generate-typert.ts` | Wrote 34 Typert artifacts. |
| `corepack pnpm exec tsc -b packages/experimental/dsh-virtuallive/tsconfig.host.json` | Passed. |
| `corepack pnpm exec tsc -b packages/experimental/dsh-virtuallive/tsconfig.client.json` | Blocked by existing DSH client-project errors (`SessionStore` versus `ISessions`), not by this package. |
| `node scripts/architecture-preflight.mjs` | Exited `2` with 7 blockers and 1 warning; the standalone checkout still lacks the Harness configs, bundler helper, sibling fixtures, and harness pin. |

The five failed client suites and the client type check are environment or
baseline blockers. Do not report them as passing, and do not weaken the tests to
make this record green. No browser rendering, Android action, Hindsight request,
or account operation was executed.
