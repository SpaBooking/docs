# SpaPortal Docs

This repository contains the public SpaPortal documentation site built with Mintlify.

## Development

Run the local preview from the repository root:

```bash
PATH=/Users/janbouchner/.nvm/versions/node/v22.20.0/bin:$PATH npx --yes mint dev --port 3001 --no-open
```

View the preview at `http://localhost:3001`.

Use another port, such as `--port 3002`, if `3001` is already in use.

## Validation

Check the documentation before publishing:

```bash
PATH=/Users/janbouchner/.nvm/versions/node/v22.20.0/bin:$PATH npx --yes mint validate
PATH=/Users/janbouchner/.nvm/versions/node/v22.20.0/bin:$PATH npx --yes mint broken-links
```

## Publishing

Mintlify deploys changes from the connected GitHub repository after commits are pushed to the configured production branch.
