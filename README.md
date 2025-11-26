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
