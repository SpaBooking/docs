# Documentation project instructions

## About this project

- This is the SpaPortal public documentation site built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links
- Source API implementation lives in `/Users/janbouchner/spaportal-3`
- Public API routes live under `/Users/janbouchner/spaportal-3/app/api/v1` and `/Users/janbouchner/spaportal-3/app/api/v2`
- Do not document internal dashboard routes from `/Users/janbouchner/spaportal-3/app/api/dashboard`
- The previous API documentation source is `/Users/janbouchner/spaportal-3/APIARY.md`

## Terminology

- Use "SpaPortal API" for the public API.
- Use "API key" or "access token" consistently for bearer authentication.
- Use "hotel", "room type", "visit type", "destination", "booking", "loyalty program", and "channel" for domain objects.
- Use "API v1" and "API v2" for version names.
- Use "guest" for a person staying at a hotel.
- Use "customer" only for the billed contact or buyer.

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise -- one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- Prefer English for public developer documentation
- Keep endpoint behavior aligned with the implementation and tests in `spaportal-3`
- Treat `APIARY.md` as historical input, not as the final source of truth

## Content boundaries

- Document public API usage, authentication, pagination, localization, errors, booking flows, and webhooks if/when a public contract exists.
- Do not document internal dashboard APIs, scheduler APIs, Auth0 internals, MongoDB internals, deployment scripts, or admin-only workflows unless the user explicitly asks.
- Do not include real API keys, customer data, production secrets, or private staging credentials.
