import { $ } from 'bun'

export interface GitCommit {
	hash: string
	message: string
	body: string
	author: string
	date: string
	files: string[]
}

/**
 * Get the current git root directory
 */
export async function getGitRoot(): Promise<string> {
	const result = await $`git rev-parse --show-toplevel`.text()
	return result.trim()
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
 */
export async function getCommitsSince(ref?: string): Promise<GitCommit[]> {
	const format = '%H|%s|%b|%an|%ai'
	const separator = '---COMMIT_SEPARATOR---'

	let result: string
	if (ref) {
		result = await $`git log ${ref}..HEAD --pretty=format:${format}${separator}`.text()
	} else {
		// Get all commits if no ref provided
		result = await $`git log --pretty=format:${format}${separator}`.text()
	}

	if (!result.trim()) return []

	const commits = result
		.split(separator)
		.filter(Boolean)
		.map((commit) => {
			const [hash, message, body, author, date] = commit.trim().split('|')
			return {
				hash: hash ?? '',
				message: message ?? '',
				body: body ?? '',
				author: author ?? '',
				date: date ?? '',
				files: [] as string[],
			}
		})
		.filter((c) => c.hash)

	// Get files for each commit
	for (const commit of commits) {
		commit.files = await getCommitFiles(commit.hash)
	}

	return commits
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
			const matchingTags = semverTags.filter(tag => regex.test(tag))
			return matchingTags[0] ?? null
		}

		return semverTags[0] ?? null
	} catch {
		return null
	}
}

/**
 * Get all tags
 */
export async function getAllTags(): Promise<string[]> {
	const result = await $`git tag -l`.text()
	return result.trim().split('\n').filter(Boolean)
}

/**
 * Get all tags for a specific package
 * Supports formats: @scope/pkg@1.0.0, pkg@1.0.0
 */
export async function getTagsForPackage(packageName: string): Promise<string[]> {
	const allTags = await getAllTags()
	// Match both scoped (@scope/pkg@version) and unscoped (pkg@version) formats
	return allTags.filter((tag) => {
		// Exact match: @scope/pkg@1.0.0 or pkg@1.0.0
		if (tag.startsWith(`${packageName}@`)) return true
		return false
	})
}

/**
 * Get the latest tag for a specific package
 */
export async function getLatestTagForPackage(packageName: string): Promise<string | null> {
	const tags = await getTagsForPackage(packageName)
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
 * Get remote URL
 */
export async function getRemoteUrl(remote = 'origin'): Promise<string | null> {
	try {
		const result = await $`git remote get-url ${remote}`.text()
		return result.trim() || null
	} catch {
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
 * Get GitHub repo URL (https://github.com/owner/repo)
 */
export async function getGitHubRepoUrl(): Promise<string | null> {
	const remoteUrl = await getRemoteUrl()
	if (!remoteUrl) return null

	const repo = parseGitHubRepo(remoteUrl)
	if (!repo) return null

	return `https://github.com/${repo.owner}/${repo.repo}`
}
