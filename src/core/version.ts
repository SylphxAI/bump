import * as semver from 'semver'
import type {
	BumpConfig,
	ConventionalCommit,
	PackageInfo,
	ReleaseType,
	VersionBump,
} from '../types.ts'
import { determineReleaseType, filterCommitsForPackage } from './commits.ts'

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
	config: BumpConfig
): VersionBump[] {
	const bumps: VersionBump[] = []
	const strategy = config.versioning ?? 'independent'

	if (strategy === 'independent') {
		// Each package can have its own version bump based on relevant commits
		for (const pkg of packages) {
			if (pkg.private) continue

			const relevantCommits = filterCommitsForPackage(commits, pkg.name)
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
				commits: strategy === 'synced' ? filterCommitsForPackage(commits, pkg.name) : commits,
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
	config: BumpConfig
): VersionBump | null {
	const releaseType = determineReleaseType(commits, config)
	if (!releaseType) return null

	return {
		package: pkg.name,
		currentVersion: pkg.version,
		newVersion: incrementVersion(pkg.version, releaseType),
		releaseType,
		commits,
	}
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
