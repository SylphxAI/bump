import { $ } from 'bun'

export interface GitCommit {
	hash: string
	message: string
	body: string
	author: string
	date: string
}

/**
 * Get the current git root directory
 */
export async function getGitRoot(): Promise<string> {
	const result = await $`git rev-parse --show-toplevel`.text()
	return result.trim()
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

	return result
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
			}
		})
		.filter((c) => c.hash)
}

/**
 * Get the latest tag matching a pattern
 */
export async function getLatestTag(pattern?: string): Promise<string | null> {
	try {
		const args = pattern ? ['--match', pattern] : []
		const result = await $`git describe --tags --abbrev=0 ${args}`.text()
		return result.trim() || null
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
