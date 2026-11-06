# Fixture integration

`api-session-resolve-agent.patch` is the DSH source change this package needs
beyond workspace and compiler membership. It adds the
`api-session/resolve-agent` waterfall event and asks a dedicated owner before
the Session API resumes an ordinary Session.

Apply it from the compatible DSH root after placing this package at
`packages/experimental/dsh-virtuallive`:

```sh
git apply packages/experimental/dsh-virtuallive/dev/api-session-resolve-agent.patch
```

`sha256: EA6B6D43A67D508C4F3809D702E0614E19E518E0A4D408693DB6352417C18908`

This patch is not a complete fixture record. The root must also contain the
package paths and project references, and the lockfile must contain this
package's importer. See [development](../docs/DEVELOPMENT.md) for the
verification result and the remaining blockers.
