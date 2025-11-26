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
 * Check if gh CLI is available
 */
export async function isGhCliAvailable(): Promise<boolean> {
	try {
		await $`gh --version`.quiet()
		return true
	} catch {
		return false
	}
}

/**
 * Check if authenticated with GitHub
 */
export async function isGhAuthenticated(): Promise<boolean> {
	try {
		await $`gh auth status`.quiet()
		return true
	} catch {
		return false
	}
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
 * Get GitHub repo info from current directory
 */
export async function getGitHubRepoInfo(): Promise<{ owner: string; repo: string } | null> {
	const remoteUrl = await getRemoteUrl()
	if (!remoteUrl) return null
	return parseGitHubRepo(remoteUrl)
}
