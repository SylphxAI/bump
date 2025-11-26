# @sylphx/bump

Automatic versioning and publishing for npm packages. Zero config, just commits.

## How It Works

1. You write commits like `feat: add login` or `fix: resolve bug`
2. Bump creates a Release PR automatically
3. You merge the PR when ready
4. Bump publishes to npm

```
git commit -m "feat: add dark mode"
git push
        ↓
   [Release PR created automatically]
        ↓
   [You merge when ready]
        ↓
   [Published to npm!]
```

## Setup (2 minutes)

### Step 1: Add the workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: SylphxAI/bump@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          npm-token: ${{ secrets.NPM_TOKEN }}
```

### Step 2: Add NPM_TOKEN secret

1. Go to [npmjs.com](https://www.npmjs.com) → Access Tokens → Generate New Token
2. Go to your repo → Settings → Secrets → Actions → New repository secret
3. Name: `NPM_TOKEN`, Value: your token

### Step 3: Done!

Push a commit and watch the magic happen.

## Commit Format

Use these prefixes in your commits:

| Commit | Version Bump | Example |
|--------|--------------|---------|
| `feat:` | Minor (1.0.0 → 1.1.0) | `feat: add dark mode` |
| `fix:` | Patch (1.0.0 → 1.0.1) | `fix: resolve login bug` |
| `feat!:` | Major (1.0.0 → 2.0.0) | `feat!: redesign API` |

Other prefixes like `docs:`, `chore:`, `test:`, `ci:` don't trigger releases.

## What Happens

When you push to main:

```
┌─────────────────────────────────────────────────────────┐
│  Your commits:                                          │
│  - feat: add user profile                               │
│  - fix: resolve logout issue                            │
│  - docs: update readme                                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  PR #42: chore(release): 1.2.0                          │
├─────────────────────────────────────────────────────────┤
│  ## 🚀 Release                                          │
│                                                         │
│  This PR will release **my-package** version **1.2.0**  │
│                                                         │
│  ### ✨ Features                                        │
│  - add user profile (abc1234)                           │
│                                                         │
│  ### 🐛 Bug Fixes                                       │
│  - resolve logout issue (def5678)                       │
│                                                         │
│  > Merging this PR will publish to npm                  │
└─────────────────────────────────────────────────────────┘
                            ↓
                    [You merge the PR]
                            ↓
                  [Published to npm! 🚀]
```

## FAQ

### When should I merge the Release PR?

Whenever you want to publish. The PR stays open and updates automatically with each push. Merge it when you're ready to release.

### What if I don't want to release yet?

Just don't merge the PR. It will keep updating as you push more commits.

### Can I release without a PR?

Yes! Use `mode: release` to publish directly:

```yaml
- uses: SylphxAI/bump@v0
  with:
    mode: release
    github-token: ${{ secrets.GITHUB_TOKEN }}
    npm-token: ${{ secrets.NPM_TOKEN }}
```

### Can I trigger releases manually?

Yes! Add `workflow_dispatch`:

```yaml
on:
  workflow_dispatch:  # Manual trigger
  push:
    branches: [main]
```

Then go to Actions → Release → Run workflow.

## CLI Usage

You can also use bump locally:

```bash
# Install
bun add -D @sylphx/bump

# Check what would be released
bunx bump status

# Preview release
bunx bump --dry-run

# Release
bunx bump

# Pre-release (alpha/beta/rc)
bunx bump --preid alpha        # 1.0.0 → 1.1.0-alpha.0
bunx bump --preid beta         # 1.0.0 → 1.1.0-beta.0
bunx bump --preid rc           # 1.0.0 → 1.1.0-rc.0
bunx bump --prerelease         # 1.0.0-alpha.0 → 1.0.0-alpha.1
```

## Monorepo Support

Bump automatically detects monorepos (via `workspaces` in package.json) and handles them intelligently:

### How It Works

1. **File-based detection**: Commits are mapped to packages by analyzing which files changed
2. **Per-package versioning**: Each package gets its own version based on its relevant commits
3. **Per-package tags**: Tags follow `@scope/pkg@1.0.0` format for independent tracking
4. **Smart PR body**: Shows all packages being released in a summary table

```
┌────────────────────────────────────────────────────────────┐
│  PR #42: chore(release): @scope/foo@1.2.0, @scope/bar@2.0.0│
├────────────────────────────────────────────────────────────┤
│  ## 🚀 Release                                             │
│                                                            │
│  | Package     | Current | New   | Type  |                 │
│  |-------------|---------|-------|-------|                 │
│  | @scope/foo  | 1.1.0   | 1.2.0 | minor |                 │
│  | @scope/bar  | 1.9.0   | 2.0.0 | major |                 │
│                                                            │
│  ### 📦 @scope/foo `1.1.0` → `1.2.0`                       │
│  - feat: add new feature (abc1234)                         │
│                                                            │
│  ### 📦 @scope/bar `1.9.0` → `2.0.0` ⚠️                    │
│  - feat!: breaking change (def5678)                        │
└────────────────────────────────────────────────────────────┘
```

### Monorepo Setup

Same workflow as single packages - just make sure you have `workspaces` in your root package.json:

```json
{
  "workspaces": ["packages/*"]
}
```

No additional configuration needed!

## Configuration (Optional)

Create `bump.config.ts` for custom settings:

```typescript
import { defineConfig } from '@sylphx/bump'

export default defineConfig({
  // Pre-release mode: set to 'alpha', 'beta', or 'rc'
  // Remove or set to false for stable releases
  prerelease: 'beta',  // → 1.1.0-beta.0

  // Customize commit types
  conventional: {
    types: {
      feat: 'minor',
      fix: 'patch',
      perf: 'patch',
      // Add your own
      improvement: 'minor',
    },
  },

  // Changelog options
  changelog: {
    file: 'CHANGELOG.md',
    groupBy: 'type', // or 'scope' or 'none'
  },

  // Publishing options
  publish: {
    access: 'public',
    tag: 'latest', // or 'next', 'beta', etc.
  },
})
```

## Pre-releases

To publish pre-release versions (alpha, beta, rc):

### Option 1: Config-based (recommended)

```typescript
// bump.config.ts
export default defineConfig({
  prerelease: 'beta',  // All releases will be beta until removed
})
```

Workflow:
1. Add `prerelease: 'beta'` to config
2. Push commits → PR created for `v1.1.0-beta.0`
3. Merge → publish beta
4. Remove `prerelease` from config when ready for stable
5. Push → PR created for `v1.1.0`

### Option 2: CLI flags

```bash
bunx bump --preid beta      # 1.0.0 → 1.1.0-beta.0
bunx bump --prerelease      # 1.1.0-beta.0 → 1.1.0-beta.1
```

## Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `mode` | `auto`, `release`, `version`, or `pr` | `auto` |
| `github-token` | GitHub token | required |
| `npm-token` | NPM token for publishing | - |
| `dry-run` | Preview without publishing | `false` |
| `base-branch` | Base branch for PR mode | `main` |
| `tag` | Create git tags | `true` |
| `changelog` | Update CHANGELOG.md | `true` |
| `github-release` | Create GitHub release | `true` |

## Permissions

The workflow requires these permissions:

```yaml
permissions:
  contents: write      # For creating tags and releases
  pull-requests: write # For creating/updating release PRs
```

## License

MIT
