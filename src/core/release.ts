/**
 * Shared release calculation logic
 * Used by both status and pr commands
 *
 * LOCAL VERSION IS SSOT:
 * - Local version (package.json) is the source of truth
 * - npm is only checked to determine if publish is needed
 * - If local > npm: already bumped, just publish
 * - If local == npm + new commits: calculate bump
 * - If local == npm + no commits: nothing to do
 */

import semver from 'semver'
import type { BumpConfig, ConventionalCommit, PackageInfo, VersionBump } from '../types.ts'
import {
	findTagForVersion,
	getAllTags,
	getLatestTag,
	getLatestTagForPackage,
} from '../utils/git.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'
import {
	type BumpFile,
	filterBumpFilesForPackage,
	getExplicitVersion,
	getHighestReleaseType,
	getPrerelease,
	isExplicitVersion,
} from './bumpfile.ts'
import { getConventionalCommits } from './commits.ts'
import {
	calculateMonorepoBumps,
	calculateSingleBump,
	createInitialBump,
	incrementVersion,
	type MonorepoBumpContext,
} from './version.ts'

export interface PackageReleaseInfo {
	pkg: PackageInfo
	npmVersion: string | null
	baselineTag: string | null
	commits: ConventionalCommit[]
}

export interface CalculateBumpsResult {
	bumps: VersionBump[]
	packageInfos: PackageReleaseInfo[]
	firstReleases: VersionBump[]
}

/**
 * Fetch release info for all packages in parallel
 * Uses LOCAL version as baseline (not npm)
 * Automatically filters out private packages
 */
export async function getPackageReleaseInfos(
	packages: PackageInfo[]
): Promise<PackageReleaseInfo[]> {
	const allTags = await getAllTags()

	// Filter out private packages - they should never be released
	const publicPackages = packages.filter((pkg) => !pkg.private)

	return Promise.all(
		publicPackages.map(async (pkg) => {
			// Query npm to check if publish is needed (local vs npm comparison)
			const npmVersion = await getNpmPublishedVersion(pkg.name)

			// Find baseline tag for LOCAL version (not npm version)
			// This is the tag for the current package.json version
			let baselineTag: string | null = findTagForVersion(pkg.version, allTags, pkg.name)

			// Fall back to latest git tag if no tag for current version
			if (!baselineTag) {
				baselineTag = await getLatestTagForPackage(pkg.name, allTags)
			}

			const commits = await getConventionalCommits(baselineTag ?? undefined)
			return { pkg, npmVersion, baselineTag, commits }
		})
	)
}

/**
 * Fetch release info for a single package
 * Uses LOCAL version as baseline
 */
export async function getSinglePackageReleaseInfo(
	pkg: PackageInfo
): Promise<PackageReleaseInfo> {
	const npmVersion = await getNpmPublishedVersion(pkg.name)
	const allTags = await getAllTags()

	// Find baseline tag for LOCAL version (not npm)
	let baselineTag: string | null = findTagForVersion(pkg.version, allTags)

	// Fall back to latest tag if no tag for current version
	if (!baselineTag) {
		baselineTag = await getLatestTag()
	}

	const commits = await getConventionalCommits(baselineTag ?? undefined)
	return { pkg, npmVersion, baselineTag, commits }
}

/**
 * Calculate version bumps from package release infos
 * LOCAL VERSION IS SSOT - no recalculation from npm
 *
 * Logic:
 * - local > npm → already bumped, publish directly
 * - local == npm + new commits → calculate bump from local
 * - local == npm + no commits → nothing to do
 * - !npmVersion → first release, use local version
 */
export function calculateBumpsFromInfos(
	packageInfos: PackageReleaseInfo[],
	config: BumpConfig,
	gitRoot: string
): CalculateBumpsResult {
	const contexts: MonorepoBumpContext[] = []
	const firstReleases: VersionBump[] = []
	const alreadyBumped: VersionBump[] = [] // local > npm, just publish

	for (const { pkg, npmVersion, baselineTag, commits } of packageInfos) {
		// Skip private packages (defense in depth - should already be filtered)
		if (pkg.private) continue

		// First release (need commits to trigger)
		if (!npmVersion) {
			if (commits.length === 0) continue
			firstReleases.push(createInitialBump(pkg, commits))
			continue
		}

		// Local > npm: already bumped (e.g., from merged PR), just publish
		// No commits needed - version was already bumped
		if (semver.gt(pkg.version, npmVersion)) {
			alreadyBumped.push({
				package: pkg.name,
				currentVersion: npmVersion,
				newVersion: pkg.version,
				releaseType: 'manual', // Indicates pre-bumped, not recalculated
				commits,
			})
			continue
		}

		// Local < npm: something is wrong (rollback? npm ahead from another branch?)
		// Skip and warn - don't try to publish older version
		if (semver.lt(pkg.version, npmVersion)) {
			// This shouldn't happen in normal workflow
			// Skip silently - the package doesn't need a release
			continue
		}

		// Local == npm: need new commits to bump
		if (commits.length === 0) continue

		// Calculate bump from LOCAL version (not npm)
		contexts.push({
			package: pkg, // Use local version as baseline
			commits,
			latestTag: baselineTag,
		})
	}

	const calculatedBumps = calculateMonorepoBumps(contexts, config, { gitRoot })
	const bumps = [...firstReleases, ...alreadyBumped, ...calculatedBumps]

	return { bumps, packageInfos, firstReleases }
}

/**
 * Calculate single package bump from release info
 * LOCAL VERSION IS SSOT
 */
export function calculateSingleBumpFromInfo(
	info: PackageReleaseInfo,
	config: BumpConfig
): VersionBump | null {
	const { pkg, npmVersion, commits } = info

	// First release
	if (!npmVersion) {
		return createInitialBump(pkg, commits)
	}

	// Local > npm: already bumped, just publish
	if (semver.gt(pkg.version, npmVersion)) {
		return {
			package: pkg.name,
			currentVersion: npmVersion,
			newVersion: pkg.version,
			releaseType: 'manual',
			commits,
		}
	}

	// Local < npm: something is wrong, skip
	if (semver.lt(pkg.version, npmVersion)) {
		return null
	}

	// Local == npm: need new commits to bump
	if (commits.length === 0) return null

	// Calculate bump from LOCAL version
	return calculateSingleBump(pkg, commits, config)
}

/**
 * Calculate version bump with bump file support
 * Bump files take precedence over commit-based calculation
 *
 * Priority:
 * 1. Explicit version from bump file (e.g., "1.1.1") → use directly
 * 2. Release type from bump file + commits → max(bump file, commits)
 * 3. No bump file → commit-based only
 */
export function calculateBumpWithBumpFiles(
	pkg: PackageInfo,
	commits: ConventionalCommit[],
	bumpFiles: BumpFile[],
	config: BumpConfig
): VersionBump | null {
	const pkgBumpFiles = filterBumpFilesForPackage(bumpFiles, pkg.name)

	// Get prerelease identifier from bump files (alpha, beta, rc)
	const preid = getPrerelease(pkgBumpFiles)

	// Check for explicit version in bump files
	const explicitVersion = getExplicitVersion(pkgBumpFiles)
	if (explicitVersion) {
		return {
			package: pkg.name,
			currentVersion: pkg.version,
			newVersion: explicitVersion,
			releaseType: 'manual',
			commits,
			bumpFileContent: pkgBumpFiles.map((bf) => bf.content).filter(Boolean).join('\n\n'),
		}
	}

	// Get release type from bump files
	const bumpFileReleaseType = getHighestReleaseType(pkgBumpFiles)

	// If we have bump files but no commits, still do the bump
	if (bumpFileReleaseType && commits.length === 0) {
		const newVersion = incrementVersion(pkg.version, bumpFileReleaseType, preid ?? undefined)
		return {
			package: pkg.name,
			currentVersion: pkg.version,
			newVersion,
			releaseType: bumpFileReleaseType,
			commits: [],
			bumpFileContent: pkgBumpFiles.map((bf) => bf.content).filter(Boolean).join('\n\n'),
		}
	}

	// Calculate commit-based bump
	const commitBump = commits.length > 0 ? calculateSingleBump(pkg, commits, config) : null

	// No bump files and no commit bump → nothing to do
	if (!bumpFileReleaseType && !commitBump) {
		return null
	}

	// Determine final release type (max of bump file and commit-based)
	const releaseTypePriority: Record<string, number> = {
		major: 3,
		minor: 2,
		patch: 1,
	}

	let finalReleaseType = commitBump?.releaseType ?? 'patch'
	if (bumpFileReleaseType) {
		const bumpFilePriority = releaseTypePriority[bumpFileReleaseType] ?? 0
		const commitPriority = releaseTypePriority[commitBump?.releaseType ?? ''] ?? 0
		if (bumpFilePriority > commitPriority) {
			finalReleaseType = bumpFileReleaseType
		}
	}

	const newVersion = incrementVersion(pkg.version, finalReleaseType, preid ?? undefined)

	return {
		package: pkg.name,
		currentVersion: pkg.version,
		newVersion,
		releaseType: finalReleaseType,
		commits,
		bumpFileContent: pkgBumpFiles.map((bf) => bf.content).filter(Boolean).join('\n\n'),
	}
}

// Legacy alias for backward compatibility
/** @deprecated Use calculateBumpWithBumpFiles instead */
export const calculateBumpWithChangesets = calculateBumpWithBumpFiles

/**
 * Check if there are any changes to process (commits or bump files)
 */
export function hasChangesToProcess(
	commits: ConventionalCommit[],
	bumpFiles: BumpFile[]
): boolean {
	return commits.length > 0 || bumpFiles.length > 0
}
