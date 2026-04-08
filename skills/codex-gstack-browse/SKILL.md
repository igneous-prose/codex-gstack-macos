# codex-gstack-browse

Use this skill for local browser capture through the repo daemon.

## Rules

- start the daemon explicitly
- keep it bound to `127.0.0.1`
- pass the bearer token to command routes
- write outputs only under the target repo or `/tmp`
- do not import cookies unless the user explicitly asks

