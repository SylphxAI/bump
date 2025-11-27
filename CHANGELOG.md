# @sylphx/bump

## 0.10.1 (2025-11-27)

### 🐛 Bug Fixes

- **action:** use NPM_CONFIG_TOKEN for bun publish authentication ([690ac9c](https://github.com/SylphxAI/bump/commit/690ac9c3e2f8fc19e58dff0ae4797abe754e06d1))
- use npm publish for monorepo (bun publish has auth issues) ([94eb52d](https://github.com/SylphxAI/bump/commit/94eb52d0f45eae6163f22fc8aac6d2f46e3085ea))
- create .npmrc in package directory for monorepo publish ([2f68d95](https://github.com/SylphxAI/bump/commit/2f68d950cdf8b58c1c3fd4d449e3cc5c2a14753e))
- sequential monorepo publish to surface errors ([1fde2e1](https://github.com/SylphxAI/bump/commit/1fde2e1176f5ee2d60431bd5e9cbcd80071586c0))

### 🔧 Chores

- add changeset for monorepo publish fix ([1b5432c](https://github.com/SylphxAI/bump/commit/1b5432c5bad26c488be990a9e98ff73329234c81))

## 0.10.0 (2025-11-27)

### ✨ Features

- add detect action for mode detection ([afb671d](https://github.com/SylphxAI/bump/commit/afb671d881401e5441b498c2aafc9aee6c9fecff))
- **action:** improve auto mode detection ([e7873dd](https://github.com/SylphxAI/bump/commit/e7873ddc6b7665d75c19a469279843b3207f2daa))
- **action:** add GitHub releases for monorepo packages ([5a01d62](https://github.com/SylphxAI/bump/commit/5a01d629e8a97e5cc1174dee11c0241d9c05e6e6))

### 🐛 Bug Fixes

- create .npmrc in working directory for bun publish ([d08cbab](https://github.com/SylphxAI/bump/commit/d08cbab8aa06498139c40ac7b083d10110f5f359))
- **action:** add GH_TOKEN to publish step for releases ([dd71954](https://github.com/SylphxAI/bump/commit/dd7195483f1071a299e2083125a7587c8627780d))

### ⚡️ Performance

- **action:** parallel publish + cache + merged steps ([743ead8](https://github.com/SylphxAI/bump/commit/743ead8ecf96366eeda7e61deb3ad88c320178b7))
- **action:** optimize for speed ([7cf426d](https://github.com/SylphxAI/bump/commit/7cf426dbb325936e7fa13c75dd84857befba8520))

### 🔧 Chores

- **release:** @sylphx/bump@0.9.0 (#11) ([795a4ea](https://github.com/SylphxAI/bump/commit/795a4ea2c0ff0a523914e73c6a016d8b33c10ca7))

## 0.9.0 (2025-11-27)

### ✨ Features

- add detect action for mode detection ([afb671d](https://github.com/SylphxAI/bump/commit/afb671d881401e5441b498c2aafc9aee6c9fecff))
- **action:** improve auto mode detection ([e7873dd](https://github.com/SylphxAI/bump/commit/e7873ddc6b7665d75c19a469279843b3207f2daa))
- **action:** add GitHub releases for monorepo packages ([5a01d62](https://github.com/SylphxAI/bump/commit/5a01d629e8a97e5cc1174dee11c0241d9c05e6e6))

### 🐛 Bug Fixes

- **action:** add GH_TOKEN to publish step for releases ([dd71954](https://github.com/SylphxAI/bump/commit/dd7195483f1071a299e2083125a7587c8627780d))

### ⚡️ Performance

- **action:** parallel publish + cache + merged steps ([743ead8](https://github.com/SylphxAI/bump/commit/743ead8ecf96366eeda7e61deb3ad88c320178b7))
- **action:** optimize for speed ([7cf426d](https://github.com/SylphxAI/bump/commit/7cf426dbb325936e7fa13c75dd84857befba8520))

## 0.8.0 (2025-11-27)

### ✨ Features

- **pr:** add cascade bump for dependent packages ([5bae9ef](https://github.com/SylphxAI/bump/commit/5bae9ef2bc91037c3012e3d43f6e920d6c7d22a3))

### 🐛 Bug Fixes

- **action:** use compact JSON for GITHUB_OUTPUT ([efa1563](https://github.com/SylphxAI/bump/commit/efa156312d4011b0ab8421c14d2a58c556e8c9cf))
- **pr:** block local execution of bump pr command ([a9a5069](https://github.com/SylphxAI/bump/commit/a9a506917bfd2c4e1c50c0b5b2e1a40c46fc36e1))
- **pr:** replace npm version with direct package.json update ([f0db4af](https://github.com/SylphxAI/bump/commit/f0db4afb4e0dae6a2b264c7da2eec6087751b0a7))

### ⚡️ Performance

- additional caching and parallelization ([5f42f25](https://github.com/SylphxAI/bump/commit/5f42f25350923982cc4050eac11b9bcdc86d9283))

### 🔧 Chores

- **release:** @sylphx/bump@0.7.0 (#9) ([5440a7e](https://github.com/SylphxAI/bump/commit/5440a7e962d2c5d6333a346b808e0e468869429f))
- **release:** @sylphx/bump@0.6.2 (#8) ([94da1ad](https://github.com/SylphxAI/bump/commit/94da1ad58fb079010b41ac8c50bf91cc88f94f7d))
- **deps:** add @sylphx/doctor to devDependencies ([a3fd621](https://github.com/SylphxAI/bump/commit/a3fd621f6ff0e3b06f98296937b364a164aca4b2))
- **release:** @sylphx/bump@0.6.1 (#7) ([716cc64](https://github.com/SylphxAI/bump/commit/716cc64ba81ae8ddbcc9052b9d9e35abe99d0e0e))

## 0.7.0 (2025-11-27)

### ✨ Features

- **pr:** add cascade bump for dependent packages ([5bae9ef](https://github.com/SylphxAI/bump/commit/5bae9ef2bc91037c3012e3d43f6e920d6c7d22a3))

### 🐛 Bug Fixes

- **pr:** block local execution of bump pr command ([a9a5069](https://github.com/SylphxAI/bump/commit/a9a506917bfd2c4e1c50c0b5b2e1a40c46fc36e1))
- **pr:** replace npm version with direct package.json update ([f0db4af](https://github.com/SylphxAI/bump/commit/f0db4afb4e0dae6a2b264c7da2eec6087751b0a7))

### ⚡️ Performance

- additional caching and parallelization ([5f42f25](https://github.com/SylphxAI/bump/commit/5f42f25350923982cc4050eac11b9bcdc86d9283))

### 🔧 Chores

- **release:** @sylphx/bump@0.6.2 (#8) ([94da1ad](https://github.com/SylphxAI/bump/commit/94da1ad58fb079010b41ac8c50bf91cc88f94f7d))
- **deps:** add @sylphx/doctor to devDependencies ([a3fd621](https://github.com/SylphxAI/bump/commit/a3fd621f6ff0e3b06f98296937b364a164aca4b2))
- **release:** @sylphx/bump@0.6.1 (#7) ([716cc64](https://github.com/SylphxAI/bump/commit/716cc64ba81ae8ddbcc9052b9d9e35abe99d0e0e))

## 0.6.2 (2025-11-27)

### 🐛 Bug Fixes

- **pr:** block local execution of bump pr command ([a9a5069](https://github.com/SylphxAI/bump/commit/a9a506917bfd2c4e1c50c0b5b2e1a40c46fc36e1))
- **pr:** replace npm version with direct package.json update ([f0db4af](https://github.com/SylphxAI/bump/commit/f0db4afb4e0dae6a2b264c7da2eec6087751b0a7))

### ⚡️ Performance

- additional caching and parallelization ([5f42f25](https://github.com/SylphxAI/bump/commit/5f42f25350923982cc4050eac11b9bcdc86d9283))

### 🔧 Chores

- **deps:** add @sylphx/doctor to devDependencies ([a3fd621](https://github.com/SylphxAI/bump/commit/a3fd621f6ff0e3b06f98296937b364a164aca4b2))
- **release:** @sylphx/bump@0.6.1 (#7) ([716cc64](https://github.com/SylphxAI/bump/commit/716cc64ba81ae8ddbcc9052b9d9e35abe99d0e0e))

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
