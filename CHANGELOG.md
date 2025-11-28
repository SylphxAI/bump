# @sylphx/bump

## 1.2.1 (2025-11-28)

### 🐛 Bug Fixes

- **action:** detect merge commits from bump/release branch ([13bcabc](https://github.com/SylphxAI/bump/commit/13bcabc9789b346f170467fc1391dabec19d8d25))

## 1.2.0 (2025-11-28)

### ✨ Features

- **pr:** show base commit in PR statistics ([4b2800c](https://github.com/SylphxAI/bump/commit/4b2800c8cf93bf470ca91bb32f551d00914200a8))

## 1.1.2 (2025-11-27)

### ♻️ Refactoring

- PR commits actual version changes, publish only publishes ([99bb396](https://github.com/SylphxAI/bump/commit/99bb396abff3de28df15ef13a61ce0b3e9db8da8))

## 1.1.1 (2025-11-27)

### 🐛 Bug Fixes

- **publish:** restore workspace:* deps after publish ([9926c81](https://github.com/SylphxAI/bump/commit/9926c817a92539c41dbe04a0fe7352d095ea8450))

## 1.1.0 (2025-11-27)

### ✨ Features

- use package.json version for first release ([0ef011a](https://github.com/SylphxAI/bump/commit/0ef011a8c565ddb3ec2a96dcb7b6e5d19688bed3))

### 🐛 Bug Fixes

- **publish:** create .npmrc at git root instead of package directory ([c76e537](https://github.com/SylphxAI/bump/commit/c76e5379186d61a3d5f5571263c8466a1c65820c))

### ✅ Tests

- add comprehensive test suite (29% → 90% coverage) ([77bf005](https://github.com/SylphxAI/bump/commit/77bf005dd74314d07ddc43ddf96063ca1f53b411))

### 🔧 Chores

- remove graduate config after 1.0.0 release ([c0c6465](https://github.com/SylphxAI/bump/commit/c0c6465c24e04664fa6b9022169554264426817f))

## 1.0.0 (2025-11-27)

### ✨ Features

- graduate to stable 1.0.0 release ([0878ba7](https://github.com/SylphxAI/bump/commit/0878ba7f7a3a976f5859e478534ce91ae702d4ac))

### 🐛 Bug Fixes

- detect graduate keyword in commit subject ([1a4e24b](https://github.com/SylphxAI/bump/commit/1a4e24bb81b071923fd02868b55bb5c515d7e851))

### ♻️ Refactoring

- remove commit message graduate detection, use config/CLI only ([d64946f](https://github.com/SylphxAI/bump/commit/d64946fdbb93b7e1fabae850b51f362229c2beca))

### 📚 Documentation

- add graduate feature documentation ([601f471](https://github.com/SylphxAI/bump/commit/601f471af1bbd31bd59a245570120edf9db052bf))

### 🔧 Chores

- add graduate config for 1.0.0 release ([c2b23f4](https://github.com/SylphxAI/bump/commit/c2b23f496a8df53ae2b2ba3fe53fa32a3c02efd3))

## 0.14.2 (2025-11-27)

### ✨ Features

- cross-platform support via zx and PM detection ([04228e6](https://github.com/SylphxAI/bump/commit/04228e6580d6714c6a71188c5101ad8761bbdf2e))
- full workspace protocol handling for all package managers ([141840a](https://github.com/SylphxAI/bump/commit/141840a208603dd9ae2ebcfda9cb284fd23f425f))

### 🐛 Bug Fixes

- use .npmrc file for npm authentication instead of env var ([fea4df0](https://github.com/SylphxAI/bump/commit/fea4df096c9440d304e3931b2dbc3a62d1c99749))
- code cleanup and update README for cross-platform support ([cde3f4f](https://github.com/SylphxAI/bump/commit/cde3f4fa94f1d8e25e845573af721abd16b2bb16))
- resolve workspace:* to actual versions before publish ([2d838ff](https://github.com/SylphxAI/bump/commit/2d838ff7f199dbd97804876ec5b867f86f09fd8f))

### 📚 Documentation

- highlight workspace protocol and cascade bumps advantages ([a0c1352](https://github.com/SylphxAI/bump/commit/a0c1352105581eddf4b7304b403fb323fb0c7adc))
- emphasize fully semantic approach ([9ca0853](https://github.com/SylphxAI/bump/commit/9ca0853760f46090a9d913f43e49b7ccc0f03f1a))
- clarify fine-grained control comparison with changesets ([965b509](https://github.com/SylphxAI/bump/commit/965b5097156ecb0d105c6b750f41fdf1b181bdda))
- add features section and changesets comparison ([b000134](https://github.com/SylphxAI/bump/commit/b0001343522f2f490e9bae4475f49b5f83119458))

## 0.14.1 (2025-11-27)

### ✨ Features

- add graduate config option for 0.x → 1.0.0 ([907a07f](https://github.com/SylphxAI/bump/commit/907a07f9c341570d5ec139c12d14b6bb0c2efb18))
- add GRADUATE:/STABLE: commit footer to trigger 0.x → 1.0.0 ([eea2bdb](https://github.com/SylphxAI/bump/commit/eea2bdb99c808cd4b536f6359782d5786a9871dc))
- apply semver 0.x rules (breaking→minor, feature→patch) ([9bfe30a](https://github.com/SylphxAI/bump/commit/9bfe30a5aa049fc9fc7de6a3e76f962e037f8d9d))

### ♻️ Refactoring

- unify version/versions output to single versions object ([2646afc](https://github.com/SylphxAI/bump/commit/2646afcef9e97be1d0bd2b9930f12dc9079065c1))

## 0.14.0 (2025-11-27)

### ✨ Features

- output version info from publish command for CI integration ([1f9a8cd](https://github.com/SylphxAI/bump/commit/1f9a8cded3e01dde97f6bbeaa5d101ac6c275f82))

## 0.13.2 (2025-11-27)

### ♻️ Refactoring

- code cleanup from review ([08ab676](https://github.com/SylphxAI/bump/commit/08ab67608101ebd1567c8199a29cffb2dd0d2942))

## 0.13.1 (2025-11-27)

### ♻️ Refactoring

- simplify release flow - PR preview-only, publish recalculates fresh ([a976b31](https://github.com/SylphxAI/bump/commit/a976b3161d156a3f6780424f0eb6a0eb449f7420))

### 👷 CI

- add permissions for release workflow ([28fbaab](https://github.com/SylphxAI/bump/commit/28fbaab139c8181266a49bcf7044bdd2be26e90d))

### 🔧 Chores

- cleanup .bump-pending.json ([a959ce1](https://github.com/SylphxAI/bump/commit/a959ce14577465136c5aacc33e8c140f53216a53))

## 0.13.0 (2025-11-27)

### ✨ Features

- atomic publish - PR only stores pending bumps, publish applies changes after merge ([b7f566d](https://github.com/SylphxAI/bump/commit/b7f566df7c7a34842c71ddcab592e5faa948f141))

## 0.12.1 (2025-11-27)

### 🐛 Bug Fixes

- **pr:** use npm published version as currentVersion to fix version jumping ([37604a2](https://github.com/SylphxAI/bump/commit/37604a2b839e2df60a20e9b2869c55cbd4d6451e))

## 0.12.0 (2025-11-27)

### ✨ Features

- **changelog:** show specific updated dependencies in changelog ([d71e532](https://github.com/SylphxAI/bump/commit/d71e5324c5aded9148d33ff42026ec7d324a84d7))
- **changelog:** show 'Dependency updates' instead of 'No notable changes' ([2a27376](https://github.com/SylphxAI/bump/commit/2a273766661961b96920478c12585367c80a43a7))

## 0.11.0 (2025-11-27)

### ✨ Features

- **version:** use npm published version as baseline for version calculation ([1e02e42](https://github.com/SylphxAI/bump/commit/1e02e42dfbfbe7aae2c8d91750d398db6817b953))

## 0.10.2 (2025-11-27)

### 🐛 Bug Fixes

- **pr:** handle gh pr create failure gracefully ([4c33726](https://github.com/SylphxAI/bump/commit/4c337268aa936ae85d45f5e9bc2182076b45967d))

### 🔧 Chores

- remove .changeset folder (bump uses git commits, not changesets) ([be3dfd9](https://github.com/SylphxAI/bump/commit/be3dfd94351407f6102f5aaf9465d517f65d0150))

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
