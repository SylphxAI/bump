// Types
export type {
	ReleaseType,
	VersionStrategy,
	BumpConfig,
	ConventionalCommit,
	PackageInfo,
	VersionBump,
	ReleaseContext,
} from './types.ts'

// Config
export { defineConfig, loadConfig, getDefaultConfig } from './core/config.ts'

// Core functionality
export {
	parseConventionalCommit,
	getConventionalCommits,
	determineReleaseType,
	groupCommitsByType,
	groupCommitsByScope,
	filterCommitsForPackage,
	fileMatchesPackage,
} from './core/commits.ts'

export {
	adjustReleaseTypeForZeroVersion,
	incrementVersion,
	isValidVersion,
	compareVersions,
	getHighestVersion,
	calculateBumps,
	calculateSingleBump,
	calculateMonorepoBumps,
	formatVersionTag,
	parseVersionFromTag,
	type CalculateBumpsOptions,
	type MonorepoBumpContext,
} from './core/version.ts'

export { generateChangelogEntry, updateChangelog, generateFullChangelog } from './core/changelog.ts'

export {
	discoverPackages,
	getSinglePackage,
	updatePackageVersion,
	updateDependencyVersions,
	isMonorepo,
} from './core/packages.ts'

// Commands (for programmatic use)
export { runBump, type BumpOptions } from './commands/bump.ts'
export { runInit, type InitOptions } from './commands/init.ts'
export { runPr, type PrOptions } from './commands/pr.ts'
export { runPublish, type PublishOptions, type PublishResult } from './commands/publish.ts'
export { runStatus, type StatusOptions } from './commands/status.ts'

// Adapters
export { createGitHubRelease, createReleaseForBump, type GitHubRelease } from './adapters/github.ts'
