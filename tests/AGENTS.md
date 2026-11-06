# Tests

Read [the root guide](../AGENTS.md) and [development](../docs/DEVELOPMENT.md) before adding or changing a test. Use only commands verified in the selected Harness fixture; do not present a package-local `npm test` or a standalone build as an existing command.

## Determinism

- Use the existing fixtures and fake clocks. Tests must not contact Android, Hindsight, a model provider, a real account, or the public network.
- Keep subprocess, HTTP, and device fakes at the narrow effect boundary. Do not replace the phone queue, memory delivery, or projection with a test-only implementation.
- Preserve replay fixtures and old record parsing. A changed projection version alone does not excuse dropping old histories.
- Use temporary directories and remove them on `onTestFinished`. Do not depend on test order or shared mutable module state.
- Name the behavior under test, not the implementation detail. Keep a failure assertion when adding a recovery path.

## Scope

- Unit tests cover domain rules, command refusal, replay, controller state, and resource disposal.
- Integration tests for the real Python worker, Android, Hindsight, and account providers stay explicit and separate from the default suite.
- A mocked `Room` component test does not establish canvas, WebGL, or image-loading behavior.
- When moving a module, update its test import in the same change. Do not weaken an existing assertion to make a structural move pass.

## Evidence

Report the command actually run, the result, and any blocked fixture or platform check. A passing mock suite is not evidence for a device or service outcome.
