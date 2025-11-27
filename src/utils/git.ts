import { $ } from 'bun'

export interface GitCommit {
	hash: string
	message: string
	body: string
	author: string
	date: string
	files: string[]
}

// Caches for expensive git operations (cleared per CLI invocation)
let cachedGitRoot: string | null = null
let cachedRemoteUrl: string | null = null
let cachedGitHubRepoUrl: string | null = null

/**
 * Get the current git root directory (cached)
 */
export async function getGitRoot(): Promise<string> {
	if (cachedGitRoot !== null) return cachedGitRoot
	const result = await $`git rev-parse --show-toplevel`.text()
	cachedGitRoot = result.trim()
	return cachedGitRoot
}

/**
 * Get files changed in a commit
 */
export async function getCommitFiles(hash: string): Promise<string[]> {
	try {
		const result = await $`git diff-tree --no-commit-id --name-only -r ${hash}`.text()
		return result.trim().split('\n').filter(Boolean)
	} catch {
		return []
	}
}

/**
 * Get all commits since a specific ref (tag or commit)
 * Optimized: Single git command with --name-only instead of N+1 calls
 */
export async function getCommitsSince(ref?: string): Promise<GitCommit[]> {
	// Use a format that includes file names in one command
	// --name-only adds changed files after each commit
	const format = '---COMMIT_START---%H|%s|%b|%an|%ai'

	let result: string
	if (ref) {
		result = await $`git log ${ref}..HEAD --pretty=format:${format} --name-only`.text()
	} else {
		result = await $`git log --pretty=format:${format} --name-only`.text()
	}

	if (!result.trim()) return []

	// Parse commits - each starts with ---COMMIT_START---
	const commitBlocks = result.split('---COMMIT_START---').filter(Boolean)

	return commitBlocks
		.map((block) => {
			const lines = block.trim().split('\n')
			const headerLine = lines[0] ?? ''
			const [hash, message, body, author, date] = headerLine.split('|')

			// Remaining non-empty lines are file paths
			const files = lines.slice(1).filter((line) => line.trim() && !line.startsWith('|'))

			return {
				hash: hash ?? '',
				message: message ?? '',
				body: body ?? '',
				author: author ?? '',
				date: date ?? '',
				files,
			}
		})
		.filter((c) => c.hash)
}

/**
 * Check if a tag is a valid semver version tag
 * Matches: v1.0.0, v1.0.0-alpha.0, 1.0.0, etc.
 */
function isSemverTag(tag: string): boolean {
	// Remove 'v' prefix if present
	const version = tag.startsWith('v') ? tag.slice(1) : tag
	// Basic semver pattern: major.minor.patch with optional prerelease
	return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)
}

/**
 * Get the latest tag matching a pattern
 * Filters to only include valid semver tags (e.g., v1.0.0, not v0)
 */
export async function getLatestTag(pattern?: string): Promise<string | null> {
	try {
		// Get all tags sorted by version (newest first)
		const result = await $`git tag -l --sort=-v:refname`.text()
		const allTags = result.trim().split('\n').filter(Boolean)

		// Filter to semver tags only
		const semverTags = allTags.filter(isSemverTag)

		// If pattern provided, filter by pattern
		if (pattern) {
			const regex = new RegExp(pattern.replace(/\*/g, '.*'))
			const matchingTags = semverTags.filter((tag) => regex.test(tag))
			return matchingTags[0] ?? null
		}

		return semverTags[0] ?? null
	} catch {
		return null
	}
}

// Tag cache for performance - cleared per CLI invocation
let cachedTags: string[] | null = null

/**
 * Get all tags (cached within session)
 */
export async function getAllTags(): Promise<string[]> {
	if (cachedTags !== null) return cachedTags
	const result = await $`git tag -l`.text()
	cachedTags = result.trim().split('\n').filter(Boolean)
	return cachedTags
}

/**
 * Clear tag cache (for testing)
 */
export function clearTagCache(): void {
	cachedTags = null
}

/**
 * Get all tags for a specific package
 * Supports formats: @scope/pkg@1.0.0, pkg@1.0.0
 * @param packageName - Package name
 * @param allTags - Pre-fetched tags (optional, for batch operations)
 */
export function getTagsForPackage(packageName: string, allTags: string[]): string[] {
	return allTags.filter((tag) => tag.startsWith(`${packageName}@`))
}

/**
 * Get the latest tag for a specific package
 * @param packageName - Package name
 * @param allTags - Pre-fetched tags (optional, uses cache if not provided)
 */
export async function getLatestTagForPackage(
	packageName: string,
	allTags?: string[]
): Promise<string | null> {
	const tags = getTagsForPackage(packageName, allTags ?? (await getAllTags()))
	if (tags.length === 0) return null

	// Sort by version (extract version from tag)
	const sortedTags = tags.sort((a, b) => {
		const versionA = a.replace(`${packageName}@`, '')
		const versionB = b.replace(`${packageName}@`, '')
		// Simple semver comparison
		const partsA = versionA.split('.').map(Number)
		const partsB = versionB.split('.').map(Number)
		for (let i = 0; i < 3; i++) {
			const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
			if (diff !== 0) return diff
		}
		return 0
	})

	return sortedTags[sortedTags.length - 1] ?? null
}

/**
 * Parse version from package tag
 * @scope/pkg@1.0.0 -> 1.0.0
 */
export function parseVersionFromPackageTag(tag: string, packageName: string): string | null {
	if (tag.startsWith(`${packageName}@`)) {
		return tag.slice(packageName.length + 1)
	}
	return null
}

/**
 * Find the tag for a specific version
 * For monorepo: looks for @scope/pkg@version or pkg@version
 * For single repo: looks for vX.X.X or X.X.X
 */
export function findTagForVersion(
	version: string,
	allTags: string[],
	packageName?: string
): string | null {
	if (packageName) {
		// Monorepo: look for package@version format
		const tag = `${packageName}@${version}`
		if (allTags.includes(tag)) {
			return tag
		}
	} else {
		// Single repo: look for vX.X.X or X.X.X format
		const vTag = `v${version}`
		if (allTags.includes(vTag)) {
			return vTag
		}
		if (allTags.includes(version)) {
			return version
		}
	}
	return null
}

/**
 * Get the commit SHA for a tag
 */
export async function getCommitForTag(tag: string): Promise<string | null> {
	try {
		const result = await $`git rev-list -n 1 ${tag}`.text()
		return result.trim() || null
	} catch {
		return null
	}
}

/**
 * Create a new tag
 */
export async function createTag(tag: string, message?: string): Promise<void> {
	if (message) {
		await $`git tag -a ${tag} -m ${message}`
	} else {
		await $`git tag ${tag}`
	}
}

/**
 * Push tags to remote
 */
export async function pushTags(): Promise<void> {
	await $`git push --tags`
}

/**
 * Stage files
 */
export async function stageFiles(files: string[]): Promise<void> {
	await $`git add ${files}`
}

/**
 * Create a commit
 */
export async function commit(message: string): Promise<void> {
	await $`git commit -m ${message}`
}

/**
 * Push to remote
 */
export async function push(): Promise<void> {
	await $`git push`
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(): Promise<string> {
	const result = await $`git rev-parse --abbrev-ref HEAD`.text()
	return result.trim()
}

/**
 * Check if working directory is clean
 */
export async function isWorkingTreeClean(): Promise<boolean> {
	const result = await $`git status --porcelain`.text()
	return !result.trim()
}

/**
 * Get remote URL (cached for 'origin')
 */
export async function getRemoteUrl(remote = 'origin'): Promise<string | null> {
	// Only cache 'origin' remote
	if (remote === 'origin' && cachedRemoteUrl !== null) return cachedRemoteUrl
	try {
		const result = await $`git remote get-url ${remote}`.text()
		const url = result.trim() || null
		if (remote === 'origin') cachedRemoteUrl = url
		return url
	} catch {
		if (remote === 'origin') cachedRemoteUrl = null
		return null
	}
}

/**
 * Parse GitHub repo info from remote URL
 */
export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
	// Handle SSH format: git@github.com:owner/repo.git
	const sshMatch = url.match(/git@github\.com:([^/]+)\/([^.]+)(?:\.git)?/)
	if (sshMatch?.[1] && sshMatch[2]) {
		return { owner: sshMatch[1], repo: sshMatch[2] }
	}

	// Handle HTTPS format: https://github.com/owner/repo.git
	const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^.]+)(?:\.git)?/)
	if (httpsMatch?.[1] && httpsMatch[2]) {
		return { owner: httpsMatch[1], repo: httpsMatch[2] }
	}

	return null
}

/**
 * Get GitHub repo URL (cached)
 */
export async function getGitHubRepoUrl(): Promise<string | null> {
	if (cachedGitHubRepoUrl !== null) return cachedGitHubRepoUrl

	const remoteUrl = await getRemoteUrl()
	if (!remoteUrl) {
		cachedGitHubRepoUrl = null
		return null
	}

	const repo = parseGitHubRepo(remoteUrl)
	if (!repo) {
		cachedGitHubRepoUrl = null
		return null
	}

	cachedGitHubRepoUrl = `https://github.com/${repo.owner}/${repo.repo}`
	return cachedGitHubRepoUrl
}
