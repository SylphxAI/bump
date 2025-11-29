import type { BumpConfig, ConventionalCommit, ReleaseType } from '../types.ts'
import { type GitCommit, getCommitsSince } from '../utils/git.ts'

/**
 * Parse a conventional commit message
 * Format: type(scope): subject
 */
export function parseConventionalCommit(commit: GitCommit): ConventionalCommit | null {
	const { hash, message, body, files } = commit

	// Match: type(scope)!: subject or type!: subject or type(scope): subject or type: subject
	const regex = /^(\w+)(?:\(([^)]+)\))?(!)?\s*:\s*(.+)$/
	const match = message.match(regex)

	if (!match) return null

	const [, type, scope, breaking, subject] = match

	// Check for BREAKING CHANGE in body
	const hasBreakingInBody = body?.includes('BREAKING CHANGE:') || body?.includes('BREAKING-CHANGE:')
	const isBreaking = !!breaking || hasBreakingInBody

	// Graduate (0.x → 1.0.0) is only triggered via config or CLI flag
	// Not via commit message - too risky for accidental triggers
	const isGraduate = false

	if (!type || !subject) return null

	return {
		hash,
		type,
		scope: scope || undefined,
		subject: subject.trim(),
		body: body || undefined,
		breaking: isBreaking,
		graduate: !!isGraduate,
		raw: message,
		files: files ?? [],
	}
}

/**
 * Check if a commit is a release commit that should be excluded from bump calculation
 * Release commits are created by bump and should not trigger new releases
 *
 * NOTE: With npm-based baseline (querying npm for published version), this filter
 * is less critical but still useful for edge cases where git tag is ahead of npm.
 */
function isReleaseCommit(commit: ConventionalCommit): boolean {
	// Skip chore(release) commits - these are bump-generated release commits
	if (commit.type === 'chore' && commit.scope === 'release') {
		return true
	}

	// Skip commits with release-like subjects (fallback)
	// These patterns match version-only subjects, not general text containing "release"
	const releasePatterns = [
		/^v?\d+\.\d+\.\d+$/, // exact version match: v1.0.0 or 1.0.0
		/^@[\w/-]+@\d+\.\d+\.\d+$/, // scoped package@version: @scope/pkg@1.0.0
	]

	for (const pattern of releasePatterns) {
		if (pattern.test(commit.subject)) {
			return true
		}
	}

	return false
}

/**
 * Get all conventional commits since a ref
 */
export async function getConventionalCommits(ref?: string): Promise<ConventionalCommit[]> {
	const commits = await getCommitsSince(ref)
	const parsed: ConventionalCommit[] = []

	for (const commit of commits) {
		const conventional = parseConventionalCommit(commit)
		if (conventional && !isReleaseCommit(conventional)) {
			parsed.push(conventional)
		}
	}

	return parsed
}

/**
 * Determine release type from commits
 */
export function determineReleaseType(
	commits: ConventionalCommit[],
	config: BumpConfig
): ReleaseType | null {
	if (commits.length === 0) return null

	const typeMapping = config.conventional?.types ?? {}

	// Check for breaking changes first
	if (commits.some((c) => c.breaking)) {
		return 'major'
	}

	// Find highest release type from commits
	let highestType: ReleaseType | null = null
	const priority: Record<ReleaseType, number> = {
		major: 3,
		minor: 2,
		patch: 1,
		premajor: 3,
		preminor: 2,
		prepatch: 1,
		prerelease: 0,
		initial: 0,
		manual: 0,
	}

	for (const commit of commits) {
		const releaseType = typeMapping[commit.type]
		if (releaseType === null || releaseType === undefined) continue

		if (!highestType || priority[releaseType] > priority[highestType]) {
			highestType = releaseType
		}
	}

	return highestType
}

/**
 * Group commits by type
 */
export function groupCommitsByType(
	commits: ConventionalCommit[]
): Map<string, ConventionalCommit[]> {
	const groups = new Map<string, ConventionalCommit[]>()

	for (const commit of commits) {
		const existing = groups.get(commit.type) ?? []
		existing.push(commit)
		groups.set(commit.type, existing)
	}

	return groups
}

/**
 * Group commits by scope
 */
export function groupCommitsByScope(
	commits: ConventionalCommit[]
): Map<string, ConventionalCommit[]> {
	const groups = new Map<string, ConventionalCommit[]>()

	for (const commit of commits) {
		const scope = commit.scope ?? 'other'
		const existing = groups.get(scope) ?? []
		existing.push(commit)
		groups.set(scope, existing)
	}

	return groups
}

/**
 * Check if a file path belongs to a package directory
 * @param filePath - relative file path from git root
 * @param packagePath - absolute or relative path to package directory
 * @param gitRoot - absolute path to git root (optional, for resolving relative paths)
 */
export function fileMatchesPackage(
	filePath: string,
	packagePath: string,
	gitRoot?: string
): boolean {
	// Normalize package path to be relative to git root
	let relativePkgPath = packagePath
	if (gitRoot && packagePath.startsWith(gitRoot)) {
		relativePkgPath = packagePath.slice(gitRoot.length).replace(/^\//, '')
	}

	// Handle root package (path is just '.' or empty)
	if (!relativePkgPath || relativePkgPath === '.') {
		return true
	}

	// Check if file is within package directory
	return filePath.startsWith(`${relativePkgPath}/`) || filePath === relativePkgPath
}

/**
 * Filter commits relevant to a specific package
 * Uses file-based detection for accuracy, with scope as fallback
 */
export function filterCommitsForPackage(
	commits: ConventionalCommit[],
	packageName: string,
	packagePath?: string,
	gitRoot?: string
): ConventionalCommit[] {
	return commits.filter((c) => {
		// If we have file information and package path, use file-based detection
		if (c.files.length > 0 && packagePath) {
			const hasMatchingFile = c.files.some((file) => fileMatchesPackage(file, packagePath, gitRoot))
			// If commit has files, only include if files match the package
			return hasMatchingFile
		}

		// Fallback to scope-based matching (when no files available)
		// Include commits with matching scope or no scope (affects all packages)
		if (!c.scope) return true
		if (c.scope === packageName) return true

		// Extract short name from scoped package (e.g., @scope/pkg -> pkg)
		const shortName = packageName.includes('/') ? packageName.split('/').pop() : packageName
		if (c.scope === shortName) return true

		return false
	})
}
