# @sylphx/bump

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
