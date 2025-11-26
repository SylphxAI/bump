# @sylphx/bump

Modern changelog and release management for Bun.

## Features

- **Conventional Commits** - Automatically detect version bumps from commit messages
- **Single Command Release** - Version, changelog, tag, and publish in one step
- **Monorepo Support** - Independent, fixed, or synced versioning strategies
- **GitHub Integration** - Create GitHub releases automatically
- **Bun Native** - Built for Bun from the ground up

## Installation

```bash
bun add -D @sylphx/bump
```

## Quick Start

```bash
# Initialize configuration
bunx bump init

# Check release status
bunx bump status

# Create a release
bunx bump
```

## Configuration

Create a `bump.config.ts` in your project root:

```typescript
import { defineConfig } from '@sylphx/bump'

export default defineConfig({
  // Version strategy: 'independent' | 'fixed' | 'synced'
  versioning: 'independent',

  // Conventional commits configuration
  conventional: {
    preset: 'conventional',
    types: {
      feat: 'minor',
      fix: 'patch',
      perf: 'patch',
      refactor: 'patch',
      revert: 'patch',
      // null means no version bump
      docs: null,
      style: null,
      test: null,
      build: null,
      ci: null,
      chore: null,
    },
  },

  // Changelog configuration
  changelog: {
    format: 'github',
    includeCommits: true,
    groupBy: 'type',
    file: 'CHANGELOG.md',
  },

  // GitHub releases
  github: {
    release: true,
    draft: false,
  },

  // npm publishing
  publish: {
    access: 'public',
    tag: 'latest',
  },
})
```

## CLI Commands

### `bump`

Create a release based on conventional commits since the last tag.

```bash
bump [options]

Options:
  -d, --dry-run      Preview changes without applying them
  --no-tag           Skip creating git tags
  --no-commit        Skip creating git commits
  --no-changelog     Skip updating changelog
  --no-release       Skip creating GitHub release
```

### `bump init`

Initialize bump configuration.

```bash
bump init [options]

Options:
  --format <ts|json>  Config format (default: ts)
  -f, --force         Overwrite existing config
```

### `bump status`

Show release status and pending changes.

```bash
bump status
```

### `bump pr`

Create or update a release PR. The PR stays open until you're ready to release.

```bash
bump pr [options]

Options:
  -d, --dry-run      Preview without creating PR
  --base <branch>    Base branch for PR (default: main)
```

## Conventional Commits

bump uses [Conventional Commits](https://www.conventionalcommits.org/) to automatically determine version bumps:

| Commit Type | Version Bump |
|-------------|--------------|
| `feat:` | Minor (0.x.0) |
| `fix:` | Patch (0.0.x) |
| `feat!:` or `BREAKING CHANGE` | Major (x.0.0) |
| `perf:`, `refactor:`, `revert:` | Patch |
| `docs:`, `style:`, `test:`, `build:`, `ci:`, `chore:` | No bump |

## Monorepo Versioning Strategies

### Independent (default)

Each package can have its own version based on its changes.

### Fixed

All packages share the same version. A change to any package bumps all.

### Synced

All packages share the same version, but only packages with changes are included in the release.

## Release Modes

bump supports three release modes to fit your workflow:

### 1. Local Release

Release directly from your terminal:

```bash
# Preview what will be released
bump --dry-run

# Release!
bump
```

### 2. Manual Trigger (Recommended)

Release on-demand via GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:
    inputs:
      dry-run:
        description: 'Dry run'
        type: boolean
        default: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: SylphxAI/bump@v0
        with:
          dry-run: ${{ inputs.dry-run }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          npm-token: ${{ secrets.NPM_TOKEN }}
```

Then click **Actions → Release → Run workflow** when you want to release.

### 3. Release PR Mode

Automatically maintain a release PR that you merge when ready:

```yaml
# .github/workflows/release-pr.yml
name: Release PR

on:
  push:
    branches: [main]

jobs:
  release-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2

      - run: bun add -g @sylphx/bump

      - run: bump pr
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This creates a PR like:

```
┌─────────────────────────────────────────┐
│ PR #42: chore(release): v1.2.0          │
├─────────────────────────────────────────┤
│ ## 🚀 Release                           │
│                                         │
│ This PR will release v1.2.0             │
│                                         │
│ ### ✨ Features                         │
│ - feat: add new feature                 │
│                                         │
│ ### 🐛 Bug Fixes                        │
│ - fix: resolve issue                    │
│                                         │
│ > Merging this PR will publish to npm   │
└─────────────────────────────────────────┘
```

**Merge the PR = Release** 🚀

## GitHub Action

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `mode` | Release mode: `release` or `version` | `release` |
| `dry-run` | Preview changes without applying | `false` |
| `github-token` | GitHub token for releases | `${{ github.token }}` |
| `npm-token` | NPM token for publishing | - |
| `publish` | Publish to npm | `true` |
| `tag` | Create git tags | `true` |
| `changelog` | Update changelog | `true` |
| `github-release` | Create GitHub release | `true` |
| `working-directory` | Working directory | `.` |

### Action Outputs

| Output | Description |
|--------|-------------|
| `published` | Whether packages were published |
| `version` | New version (single package) |
| `versions` | JSON of versions (monorepo) |

### Examples

**Dry run on PRs:**

```yaml
- uses: SylphxAI/bump@v0.1.0
  with:
    dry-run: ${{ github.event_name == 'pull_request' }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Version only (no publish):**

```yaml
- uses: SylphxAI/bump@v0.1.0
  with:
    mode: version
    publish: false
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Programmatic API

```typescript
import { runBump, loadConfig, getConventionalCommits } from '@sylphx/bump'

// Run a release programmatically
const result = await runBump({
  dryRun: true,
  changelog: true,
  tag: true,
})

// Load configuration
const config = await loadConfig(process.cwd())

// Get commits since last tag
const commits = await getConventionalCommits('v1.0.0')
```

## License

MIT
