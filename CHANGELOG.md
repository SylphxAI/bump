# @sylphx/bump

## 0.6.1 (2025-11-26)

### 🐛 Bug Fixes

- **pr:** replace npm version with direct package.json update ([f0db4af](https://github.com/SylphxAI/bump/commit/f0db4afb4e0dae6a2b264c7da2eec6087751b0a7))

### ⚡️ Performance

- additional caching and parallelization ([5f42f25](https://github.com/SylphxAI/bump/commit/5f42f25350923982cc4050eac11b9bcdc86d9283))

## 0.6.0 (2025-11-26)

### ✨ Features

- **action:** add slack webhook notification support ([4b03ea5](https://github.com/SylphxAI/bump/commit/4b03ea511fd2a4597f8db50b8ec2186855478ca1))

### 🐛 Bug Fixes

- **action:** use CHANGELOG.md content for GitHub release notes ([dad3fdb](https://github.com/SylphxAI/bump/commit/dad3fdb7ba93204faf35a932693e78c8c3f1dc34))

### ⏪ Reverts

- remove slack from bump (not its responsibility) ([483495b](https://github.com/SylphxAI/bump/commit/483495b328bc4f0948a8001bf246ce76192273c9))

## 0.5.0 (2025-11-26)

### ✨ Features

- **cli:** add --alpha, --beta, --rc flags and verbose mode ([53fb5a2](https://github.com/SylphxAI/bump/commit/53fb5a2da45449f167eaea530424e9e549b5f964))
- add config-based prerelease support ([a3157c6](https://github.com/SylphxAI/bump/commit/a3157c66df211d02ee6c2279c7c8b8891fb173de))
- add CHANGELOG.md updates, pre-release support, and better error handling ([ad382d3](https://github.com/SylphxAI/bump/commit/ad382d3a24fe24082e2ec7317bb3cc7b2774d746))

### 🐛 Bug Fixes

- **git:** filter non-semver tags in getLatestTag ([ff8c7f6](https://github.com/SylphxAI/bump/commit/ff8c7f6a9b264dc41f433f8a2566963f79074873))
- **action:** install dependencies before publish ([18ec304](https://github.com/SylphxAI/bump/commit/18ec3041925323020783aaf6fd1a91921c4f928f))
- **action:** only publish when published output is true ([978fc7a](https://github.com/SylphxAI/bump/commit/978fc7a001377b8d2de5f68e5eeb637eb61989a1))

## 0.2.0

### Minor Changes

- [`6c6b218`](https://github.com/SylphxAI/bump/commit/6c6b218acb0eaa2bc520dbce2480d45e9ecdd715) Thanks [@shtse8](https://github.com/shtse8)! - Add Release PR mode and three release workflows

  Features:

  - New `bump pr` command to create/update release PRs
  - Release PR is auto-maintained - merge to release
  - Three release modes: local, manual trigger, release PR
  - Example workflows for each mode

  This makes bump a complete replacement for changesets with simpler workflow:

  - No manual changeset files needed
  - Version determined automatically from conventional commits
  - You control when to release (merge PR or trigger workflow)

## 0.1.0

### Minor Changes

- [`01d5aae`](https://github.com/SylphxAI/bump/commit/01d5aae6e281f7e3f73944fa7a4464db3de898e1) Thanks [@shtse8](https://github.com/shtse8)! - Initial release of @sylphx/bump - Modern changelog and release management for Bun

  Features:

  - Conventional commits parsing with automatic release type detection
  - Semantic versioning (major, minor, patch, prerelease)
  - Monorepo support with independent, fixed, and synced versioning strategies
  - Changelog generation with type grouping and emoji support
  - GitHub releases integration via gh CLI
  - CLI commands: `bump`, `bump init`, `bump status`
  - Programmatic API for custom integrations
