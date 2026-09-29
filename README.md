# SpaPortal Docs

This repository contains the public SpaPortal documentation site built with Mintlify.

## Development

Use Node.js 22, matching CI, and install the locked dependencies:

```bash
npm ci
./node_modules/.bin/mint dev --port 3001 --no-open
```

View the preview at `http://localhost:3001`. Choose another port if it is busy.

## Validation

Run these checks before publishing:

```bash
npm run validate
./node_modules/.bin/mint broken-links
```

`validate` checks MDX frontmatter, lints both v1 and v2 OpenAPI files, checks
amenity contract cases, validates examples against their schemas, bundles v2,
and validates the Mintlify build. Amenity checks cover null details, label
expansion, category scopes, and empty groups using native OpenAPI nullability
validation.

`scripts/validate-examples.mjs` validates OpenAPI schema and request/response
examples, and parses every JSON fence in tracked MDX pages. The bindings in
`scripts/example-schemas.json` associate MDX JSON fences (in page order) with
schemas. Each binding can select a JSON pointer with `at` so deliberately
abridged responses can validate a complete nested object. Schema references use
`v1#/definitions/Name` or `v2#/definitions/Name`, after the script converts
OpenAPI 3.0 schemas to JSON Schema. Update the bindings when adding or changing
examples. These checks verify shape, not business meaning or deployment state;
compare those with the application implementation and tests.

## Publishing

Mintlify deploys changes merged into `main`. Publishing documentation does not
deploy the API application. Confirm the API contract and release dates before
publishing. Keep release-date placeholders until the corresponding release has
been confirmed.
