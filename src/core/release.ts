/**
 * Shared release calculation logic
 * Used by both status and pr commands
 */

import type { BumpConfig, ConventionalCommit, PackageInfo, VersionBump } from '../types.ts'
import {
	findTagForVersion,
	getAllTags,
	getLatestTag,
	getLatestTagForPackage,
} from '../utils/git.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'
import { getConventionalCommits } from './commits.ts'
import { calculateMonorepoBumps, calculateSingleBump, type MonorepoBumpContext } from './version.ts'

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
 * Queries npm for published versions and finds baseline tags
 */
export async function getPackageReleaseInfos(
	packages: PackageInfo[]
): Promise<PackageReleaseInfo[]> {
	const allTags = await getAllTags()

	return Promise.all(
		packages.map(async (pkg) => {
			// Query npm for the latest published version (source of truth)
			const npmVersion = await getNpmPublishedVersion(pkg.name)

			// Find the git tag corresponding to that npm version
			let baselineTag: string | null = null
			if (npmVersion) {
				baselineTag = findTagForVersion(npmVersion, allTags, pkg.name)
			}

			// Fall back to latest git tag if npm version not found or tag missing
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
 */
export async function getSinglePackageReleaseInfo(
	pkg: PackageInfo
): Promise<PackageReleaseInfo> {
	const npmVersion = await getNpmPublishedVersion(pkg.name)
	const allTags = await getAllTags()

	let baselineTag: string | null = null
	if (npmVersion) {
		baselineTag = findTagForVersion(npmVersion, allTags)
	}

	if (!baselineTag) {
		baselineTag = await getLatestTag()
	}

	const commits = await getConventionalCommits(baselineTag ?? undefined)
	return { pkg, npmVersion, baselineTag, commits }
}

/**
 * Calculate version bumps from package release infos
 * Uses npm version as baseline (source of truth)
 */
export function calculateBumpsFromInfos(
	packageInfos: PackageReleaseInfo[],
	config: BumpConfig,
	gitRoot: string
): CalculateBumpsResult {
	const contexts: MonorepoBumpContext[] = []
	const firstReleases: VersionBump[] = []

	for (const { pkg, npmVersion, baselineTag, commits } of packageInfos) {
		if (commits.length === 0) continue

		// First release: use package.json version directly
		if (!npmVersion) {
			firstReleases.push({
				package: pkg.name,
				currentVersion: pkg.version,
				newVersion: pkg.version,
				releaseType: 'patch', // Initial release marker
				commits,
			})
		} else {
			// Already published: use npm version as baseline for calculation
			const pkgWithNpmVersion = { ...pkg, version: npmVersion }
			contexts.push({
				package: pkgWithNpmVersion,
				commits,
				latestTag: baselineTag,
			})
		}
	}

	const calculatedBumps = calculateMonorepoBumps(contexts, config, { gitRoot })
	const bumps = [...firstReleases, ...calculatedBumps]

	return { bumps, packageInfos, firstReleases }
}

/**
 * Calculate single package bump from release info
 * Uses npm version as baseline (source of truth)
 */
export function calculateSingleBumpFromInfo(
	info: PackageReleaseInfo,
	config: BumpConfig
): VersionBump | null {
	const { pkg, npmVersion, commits } = info

	if (commits.length === 0) return null

	// First release: use package.json version directly
	if (!npmVersion) {
		return {
			package: pkg.name,
			currentVersion: pkg.version,
			newVersion: pkg.version,
			releaseType: 'patch',
			commits,
		}
	}

	// Use npm version as baseline for calculation
	const pkgWithNpmVersion = { ...pkg, version: npmVersion }
	return calculateSingleBump(pkgWithNpmVersion, commits, config)
}
