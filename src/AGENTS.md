# Shared and host code

Read [the root guide](../AGENTS.md) and [the architecture](../docs/ARCHITECTURE.md) before changing shared rules, host services, or wire types. Browser code has [its own guide](client/AGENTS.md).

## Ownership

- Session records are the only durable resident history. Projection values are derived; do not mutate a projection or append a compensating record because an animation or request ended.
- `state.ts` still combines resident schemas, validated event decoding, the pure reducer, and the DSH projection definition. Home layout and arrangement schemas live in `domain/home/`; extract another pure part only when it has a caller or a deterministic test, and keep DSH registration at the host edge.
- Route GUI and model edits through one command path. Read the current state, validate the observed revision and the complete input, compute the decision, and append the record inside one serialized section. Never await unrelated work between the revision check and the append.
- Keep one furniture catalog and one geometry implementation for validation and rendering. A visual-only copy drifts.
- Keep the phone queue shared by GUI and model callers. A rejected request and an uncertain request are different outcomes. Never retry a mutation whose device effect is unknown; require a successful explicit observation before resuming input.
- Persist accepted memory work before delivery. Preserve operation IDs, destination binding, ordering policy, and prior outcomes across retries and restarts. A failed head entry must not disappear; define whether later entries may proceed and expose a deliberate recovery action.
- Keep credentials, cookie values, secret QR polling keys, screenshots, accessibility text, and memory content out of tool results, logs, and diagnostics. Use the credential provider; do not copy secrets into DTOs.
- Give every subscription, timer, listener, image load, GPU resource, stream, and child process one owner. Disposal stops admission before draining owned work.

## Imports

- Shared rules and wire types may depend on pure libraries and other shared types. They must not import host services, Node I/O, DOM, React, network clients, or subprocess code.
- Host modules may depend on shared rules, contracts, DSH services, and their own implementation. They must not import browser code.
- `memory-state.ts` imports `node:crypto`; keep it host-only even though its reducer is deterministic.
- Type-only imports count as coupling. Do not add a barrel that exposes host implementations to the browser.

## Changing the surface

- Preserve record names, projection keys and versions, public exports, and remote method identities unless the change deliberately replaces them. A projection version bump does not migrate old log records.
- Update the host and client TypeScript input lists, generated Typert inputs, tests, and packaged asset paths together when moving a module.
- Keep the public entry points `src/index.ts`, `src/client/index.ts`, and `src/types.ts` stable. Audit the `./src/*` export before removing a path that another package or deployment may import.
- Add a test for changed behavior or a concrete uncovered failure. Keep real model, Android, Hindsight, and account checks separate from default tests.
- Use only commands recorded in [development](../docs/DEVELOPMENT.md); the package does not declare a local test or typecheck script.
