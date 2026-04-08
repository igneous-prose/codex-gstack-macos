# Cookie Import

Cookie import is an advanced, explicit action.

## Rules

- Never runs during bootstrap, install, daemon start, or normal skill execution
- Lists available domains first
- Imports only the domains the user names
- Uses real browser session material from local Chromium-family browser profiles
- Does not persist plaintext cookie export files into repo state

## Trust boundary

When you run cookie import, the command is handling live local browser session material. Only use it for domains you trust and only when you intend to reuse those sessions inside the local Playwright context.

