# Packaged assets and Python worker

Read [the root guide](../AGENTS.md), [development](../docs/DEVELOPMENT.md), and the phone section of [the architecture](../docs/ARCHITECTURE.md) before changing the worker protocol, its dependencies, or authored artwork.

## Phone worker

- `phone-worker.py` is the process boundary between the host and the dedicated Android device. Keep request and response fields in the versioned protocol shared with `src/phone-protocol.ts`.
- The worker reads one request and writes one response. Keep the protocol bounded: reject oversized input and preserve a machine-readable failure instead of printing diagnostics into the response stream.
- Do not add an automatic retry around a tap, swipe, text entry, app launch, or navigation. A timeout after dispatch is an uncertain outcome, not a safe retry.
- Pin the tested Python interpreter and mobile-control dependency environment when changing the worker. A declaration in a README is not a compatible environment.
- Verify worker lookup from source and from packaged output. Moving the worker changes source-relative paths and may change `import.meta.url` after bundling.
- Never log screenshots, entered text, accessibility trees, account cookies, or QR polling keys.

## Artwork

- Keep `artwork.json` accurate for every shipped image: native dimensions, crop, provenance, prompt or source, attribution, and license.
- Code and character-derived artwork have separate licensing conditions. Do not represent artwork as MIT-licensed because the code is.
- Do not replace or redraw an official character asset without the provenance and designer review required by the project.
