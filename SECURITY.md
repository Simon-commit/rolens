# Security policy

RoLens exists to be an extension people can trust, so security reports are the highest priority.

## Reporting a vulnerability

Please report privately through [GitHub security advisories](https://github.com/Simon-commit/rolens/security/advisories/new).
Do not open a public issue for security problems.

Include what you found, how to reproduce it, and the version (see `chrome://extensions`).
You'll get a reply within a few days.

## What RoLens will never do

- Read Roblox cookies or session tokens, or call Roblox APIs on your behalf.
- Send, accept or decline trades.
- Load or run code from the network.
- Collect analytics or send any data about you anywhere.

Any change to `permissions` or `host_permissions` in `src/manifest.json` is called out in the
changelog and needs a clear reason in its pull request.

## Supported versions

Only the latest release receives fixes.
