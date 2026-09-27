# Security policy

RoLens is built to be an extension people can trust, and security reports are treated as the highest priority.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/Simon-commit/rolens/security/advisories/new).
Do not open a public issue for security problems.

Please include a description of the issue, steps to reproduce it and the version number (shown at `chrome://extensions`).
You can expect a response within a few days.

## Commitments

RoLens will never:

- Read Roblox cookies or session tokens, or call Roblox APIs on your behalf.
- Send, accept or decline trades.
- Load or run code from the network.
- Collect analytics or send any data about you anywhere.

Any change to `permissions` or `host_permissions` in `src/manifest.json` is listed in the
changelog and requires a stated justification in its pull request.

## Supported versions

Security fixes are provided for the latest release only.
