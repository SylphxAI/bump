# Bump Project Boundary

## Status: Retired

`@sylphx/bump` is retired. SylphxAI package releases now use Changesets for release intent/version PRs and the reusable `SylphxAI/.github/.github/workflows/release.yml@main` workflow for workspace-safe publishing.

Do not relaunch Bump, add new consumers, or use semantic-commit auto-bumping as the release source of truth. The npm package is deprecated and the GitHub Action now fails fast with a retirement message.

## Historical scope

Bump was a release automation CLI and GitHub Action that turned conventional commits and optional bump files into release PRs, changelogs, semantic versions, and npm publication. This behavior is retained only as historical source code for auditability.

## Current non-goals

- Do not own consuming repositories' release readiness or package-specific policy.
- Do not own GitHub branch protection, npm org permissions, runner fleet capacity, or central CI admission policy.
- Do not own runtime deploy, database migration, canary, rollback, or production app recovery behavior.
- Do not publish new `@sylphx/bump` versions.

## Canonical replacement

Use Changesets plus the central Sylphx release workflow:

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

The central publisher materializes internal workspace ranges, packs and audits the tarball manifest, then publishes the exact audited tarball with npm.

## Agent entry

Treat this repository as retired. Changes should be limited to archival metadata, security deprecation evidence, or documentation that prevents future use.
