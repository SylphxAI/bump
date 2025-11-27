import * as semver from 'semver'
import type {
	BumpConfig,
	ConventionalCommit,
	PackageInfo,
	ReleaseType,
	VersionBump,
} from '../types.ts'
import { determineReleaseType, filterCommitsForPackage } from './commits.ts'

export interface CalculateBumpsOptions {
	/** Git root directory for resolving relative paths */
	gitRoot?: string
	/** Pre-release identifier (alpha, beta, rc) */
	preid?: string
	/** Create a pre-release version */
	prerelease?: boolean
}

export interface MonorepoBumpContext {
	/** Package info */
	package: PackageInfo
	/** All commits since the package's last tag */
	commits: ConventionalCommit[]
	/** Package's latest tag (e.g., @scope/pkg@1.0.0) */
	latestTag: string | null
}

/**
 * Increment version based on release type
 */
export function incrementVersion(
	currentVersion: string,
	releaseType: ReleaseType,
	preid?: string
): string {
	const result = preid
		? semver.inc(currentVersion, releaseType, preid)
		: semver.inc(currentVersion, releaseType)
	if (!result) {
		throw new Error(
			`Failed to increment version ${currentVersion} with release type ${releaseType}`
		)
	}
	return result
}

/**
 * Validate a version string
 */
export function isValidVersion(version: string): boolean {
	return semver.valid(version) !== null
}

/**
 * Compare two versions
 */
export function compareVersions(a: string, b: string): number {
	return semver.compare(a, b)
}

/**
 * Get the highest version from a list
 */
export function getHighestVersion(versions: string[]): string | null {
	const valid = versions.filter(isValidVersion)
	if (valid.length === 0) return null

	return valid.reduce((highest, current) => {
		return compareVersions(current, highest) > 0 ? current : highest
	})
}

/**
 * Calculate version bumps for packages based on commits
 */
export function calculateBumps(
	packages: PackageInfo[],
	commits: ConventionalCommit[],
	config: BumpConfig,
	options?: CalculateBumpsOptions
): VersionBump[] {
	const bumps: VersionBump[] = []
	const strategy = config.versioning ?? 'independent'
	const gitRoot = options?.gitRoot

	if (strategy === 'independent') {
		// Each package can have its own version bump based on relevant commits
		for (const pkg of packages) {
			if (pkg.private) continue

			const relevantCommits = filterCommitsForPackage(commits, pkg.name, pkg.path, gitRoot)
			const releaseType = determineReleaseType(relevantCommits, config)

			if (releaseType) {
				bumps.push({
					package: pkg.name,
					currentVersion: pkg.version,
					newVersion: incrementVersion(pkg.version, releaseType),
					releaseType,
					commits: relevantCommits,
				})
			}
		}
	} else if (strategy === 'fixed' || strategy === 'synced') {
		// All packages share the same version
		// Find the highest release type needed
		const releaseType = determineReleaseType(commits, config)
		if (!releaseType) return bumps

		// Get the highest current version
		const versions = packages.filter((p) => !p.private).map((p) => p.version)
		const highestVersion = getHighestVersion(versions)
		if (!highestVersion) return bumps

		const newVersion = incrementVersion(highestVersion, releaseType)

		// Apply to all non-private packages
		for (const pkg of packages) {
			if (pkg.private) continue

			bumps.push({
				package: pkg.name,
				currentVersion: pkg.version,
				newVersion,
				releaseType,
				commits:
					strategy === 'synced'
						? filterCommitsForPackage(commits, pkg.name, pkg.path, gitRoot)
						: commits,
			})
		}
	}

	return bumps
}

/**
 * Calculate single package bump (for non-monorepo)
 */
export function calculateSingleBump(
	pkg: PackageInfo,
	commits: ConventionalCommit[],
	config: BumpConfig,
	options?: CalculateBumpsOptions
): VersionBump | null {
	let releaseType = determineReleaseType(commits, config)
	if (!releaseType) return null

	// Check for pre-release: CLI option takes precedence, then config
	// config.prerelease is string | false | undefined
	const configPrerelease = config.prerelease
	const preid =
		options?.preid ??
		(typeof configPrerelease === 'string' ? configPrerelease : undefined)
	const prerelease = options?.prerelease ?? !!preid

	// Convert to pre-release type if requested
	if (prerelease || preid) {
		const preReleaseMap: Record<ReleaseType, ReleaseType> = {
			major: 'premajor',
			minor: 'preminor',
			patch: 'prepatch',
			premajor: 'premajor',
			preminor: 'preminor',
			prepatch: 'prepatch',
			prerelease: 'prerelease',
		}
		releaseType = preReleaseMap[releaseType] ?? releaseType
	}

	return {
		package: pkg.name,
		currentVersion: pkg.version,
		newVersion: incrementVersion(pkg.version, releaseType, preid),
		releaseType,
		commits,
	}
}

/**
 * Calculate version bumps for monorepo packages with per-package context
 * Each package has its own commits since its last tag
 */
export function calculateMonorepoBumps(
	contexts: MonorepoBumpContext[],
	config: BumpConfig,
	options?: CalculateBumpsOptions
): VersionBump[] {
	const bumps: VersionBump[] = []
	const gitRoot = options?.gitRoot

	// Check for pre-release: CLI option takes precedence, then config
	// config.prerelease is string | false | undefined
	const configPrerelease = config.prerelease
	const preid =
		options?.preid ??
		(typeof configPrerelease === 'string' ? configPrerelease : undefined)
	const prerelease = options?.prerelease ?? !!preid

	for (const ctx of contexts) {
		if (ctx.package.private) continue

		// Filter commits that affect this package using file-based detection
		const relevantCommits = filterCommitsForPackage(
			ctx.commits,
			ctx.package.name,
			ctx.package.path,
			gitRoot
		)

		let releaseType = determineReleaseType(relevantCommits, config)

		if (releaseType) {
			// Convert to pre-release type if requested
			if (prerelease || preid) {
				const preReleaseMap: Record<ReleaseType, ReleaseType> = {
					major: 'premajor',
					minor: 'preminor',
					patch: 'prepatch',
					premajor: 'premajor',
					preminor: 'preminor',
					prepatch: 'prepatch',
					prerelease: 'prerelease',
				}
				releaseType = preReleaseMap[releaseType] ?? releaseType
			}

			bumps.push({
				package: ctx.package.name,
				currentVersion: ctx.package.version,
				newVersion: incrementVersion(ctx.package.version, releaseType, preid),
				releaseType,
				commits: relevantCommits,
			})
		}
	}

	return bumps
}

/**
 * Format version with optional prefix
 */
export function formatVersionTag(version: string, prefix = 'v'): string {
	return `${prefix}${version}`
}

/**
 * Parse version from tag
 */
export function parseVersionFromTag(tag: string, prefix = 'v'): string | null {
	if (tag.startsWith(prefix)) {
		const version = tag.slice(prefix.length)
		return isValidVersion(version) ? version : null
	}
	return isValidVersion(tag) ? tag : null
}
