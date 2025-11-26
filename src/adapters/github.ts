import { $ } from 'bun'
import { generateChangelogEntry } from '../core/changelog.ts'
import type { BumpConfig, VersionBump } from '../types.ts'
import { getRemoteUrl, parseGitHubRepo } from '../utils/git.ts'

export interface GitHubRelease {
	tag: string
	name: string
	body: string
	draft: boolean
	prerelease: boolean
}

// Cache gh CLI availability checks (once per session)
let ghCliAvailable: boolean | null = null
let ghAuthenticated: boolean | null = null

/**
 * Create a GitHub release using gh CLI
 */
export async function createGitHubRelease(release: GitHubRelease): Promise<string> {
	const args: string[] = [
		'release',
		'create',
		release.tag,
		'--title',
		release.name,
		'--notes',
		release.body,
	]

	if (release.draft) {
		args.push('--draft')
	}

	if (release.prerelease) {
		args.push('--prerelease')
	}

	const result = await $`gh ${args}`.text()
	return result.trim()
}

/**
 * Check if gh CLI is available (cached)
 */
export async function isGhCliAvailable(): Promise<boolean> {
	if (ghCliAvailable !== null) return ghCliAvailable
	try {
		await $`gh --version`.quiet()
		ghCliAvailable = true
	} catch {
		ghCliAvailable = false
	}
	return ghCliAvailable
}

/**
 * Check if authenticated with GitHub (cached)
 */
export async function isGhAuthenticated(): Promise<boolean> {
	if (ghAuthenticated !== null) return ghAuthenticated
	try {
		await $`gh auth status`.quiet()
		ghAuthenticated = true
	} catch {
		ghAuthenticated = false
	}
	return ghAuthenticated
}

/**
 * Check gh CLI availability and authentication (combined, cached)
 */
export async function checkGhReady(): Promise<{ available: boolean; authenticated: boolean }> {
	const [available, authenticated] = await Promise.all([isGhCliAvailable(), isGhAuthenticated()])
	return { available, authenticated }
}

/**
 * Create GitHub release for a version bump
 */
export async function createReleaseForBump(
	bump: VersionBump,
	config: BumpConfig,
	tagPrefix = 'v'
): Promise<string | null> {
	if (!config.github?.release) return null

	// Check if gh CLI is available and authenticated
	if (!(await isGhCliAvailable())) {
		console.warn('GitHub CLI (gh) not found. Skipping GitHub release.')
		return null
	}

	if (!(await isGhAuthenticated())) {
		console.warn('Not authenticated with GitHub. Skipping GitHub release.')
		return null
	}

	const tag = `${tagPrefix}${bump.newVersion}`
	const releaseName =
		config.github.releaseName?.replace('{version}', bump.newVersion) ?? `v${bump.newVersion}`
	const body = generateChangelogEntry(bump, config)
	const isPrerelease = bump.releaseType.startsWith('pre')

	return createGitHubRelease({
		tag,
		name: releaseName,
		body,
		draft: config.github.draft ?? false,
		prerelease: isPrerelease,
	})
}

/**
 * Create multiple GitHub releases in parallel
 */
export async function createReleasesForBumps(
	bumps: VersionBump[],
	config: BumpConfig,
	tagPrefix = 'v'
): Promise<(string | null)[]> {
	if (!config.github?.release || bumps.length === 0) return []

	// Check gh CLI once for all releases
	const { available, authenticated } = await checkGhReady()
	if (!available) {
		console.warn('GitHub CLI (gh) not found. Skipping GitHub releases.')
		return bumps.map(() => null)
	}
	if (!authenticated) {
		console.warn('Not authenticated with GitHub. Skipping GitHub releases.')
		return bumps.map(() => null)
	}

	// Create all releases in parallel
	return Promise.all(
		bumps.map(async (bump) => {
			const tag = `${tagPrefix}${bump.newVersion}`
			const releaseName =
				config.github?.releaseName?.replace('{version}', bump.newVersion) ?? `v${bump.newVersion}`
			const body = generateChangelogEntry(bump, config)
			const isPrerelease = bump.releaseType.startsWith('pre')

			try {
				return await createGitHubRelease({
					tag,
					name: releaseName,
					body,
					draft: config.github?.draft ?? false,
					prerelease: isPrerelease,
				})
			} catch {
				return null
			}
		})
	)
}

/**
 * Get GitHub repo info from current directory
 */
export async function getGitHubRepoInfo(): Promise<{ owner: string; repo: string } | null> {
	const remoteUrl = await getRemoteUrl()
	if (!remoteUrl) return null
	return parseGitHubRepo(remoteUrl)
}
