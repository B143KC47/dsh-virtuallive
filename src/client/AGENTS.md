# Browser code

Read [the root guide](../../AGENTS.md), [the shared/host guide](../AGENTS.md), and [the architecture](../../docs/ARCHITECTURE.md) before changing a controller, view, scene, or browser asset.

## Ownership

- A controller owns remote subscriptions, request lifetimes, and client-side request state such as sending, reconnecting, and unconfirmed submission. It does not own authoritative resident history.
- A React view owns local form state, focus, and display. It reads controller faces and invokes callbacks; it does not call host internals or write Session records.
- `Room.tsx` owns one mounted scene lifetime. The scene core owns images, observers, animation callbacks, caches, and GPU resources. Unmounting disposes the scene; a partial load failure disposes everything acquired before the failure.
- Presentation may interpolate a recorded journey from state and browser time. It must not append an arrival or movement record because an animation finished.
- Keep browser assets under `src/client/assets/`. The Harness client bundler resolves this location; moving assets also changes imports, atlas metadata, tests, and the artwork manifest.

## Imports and runtime

- Browser modules must not import Node built-ins, host services, credential storage, worker processes, or a root barrel that reaches host implementations.
- Type-only imports count as coupling. Keep scene code independent of the Remote transport.
- Keep the default 60 fps and the configured pixel-ratio limit unless a measured rendering requirement justifies a change. Stop animation for a hidden view and respect reduced-motion preferences.
- Route product copy through the typed locale dictionaries. Update English and Chinese meanings together; do not hardcode visible strings in a component.
- Keep controller/view separation. Passing a Cordis `Context` into a React component hides ownership and couples the view to the runtime.

## Tests

- Test controller reconnection and unconfirmed-request behavior when changing request lifetimes.
- Test scene disposal on unmount and on partial image-load failure when changing resource ownership.
- A component test that mocks `Room` does not verify canvas or WebGL behavior. Report that limit instead of claiming visual verification.
- Use [the test guide](../../tests/AGENTS.md) for fixtures and external-service boundaries.
