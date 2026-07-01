# @sylphx/bump — Retired

`@sylphx/bump` is retired and must not be used for new SylphxAI releases.

SylphxAI standardized on:

1. **Changesets** for release intent, version PRs, changelogs, tags, and GitHub Releases.
2. **`SylphxAI/.github/.github/workflows/release.yml@main`** for workspace-safe npm publishing.

The historical Bump model used semantic commits and optional bump files to infer releases. That is no longer the org standard: a package changes version only when a changeset or explicit release process asks for it.

## Replacement workflow

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    permissions:
      actions: write
      contents: write
      pull-requests: write
      id-token: write
    uses: SylphxAI/.github/.github/workflows/release.yml@main
    secrets: inherit
```

## Workspace publishing guarantee

Source manifests may still use `workspace:*` to express monorepo intent. The central publisher is responsible for publication safety: it materializes internal workspace ranges from local package versions, packs packages, audits `package/package.json` inside each tarball, and publishes the same audited tarball with `npm publish <tarball>`.

Published npm metadata must never contain `workspace:*`.

## Historical source

This repository remains available only for audit/history. The npm package is deprecated and the GitHub Action fails fast with a retirement message.
