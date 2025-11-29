import { join } from 'node:path'
import type { BumpConfig, ConventionalCommit, VersionBump } from '../types.ts'
import { readFile, writeFile } from '../utils/fs.ts'
import { groupCommitsByType } from './commits.ts'

const TYPE_LABELS: Record<string, string> = {
	feat: '✨ Features',
	fix: '🐛 Bug Fixes',
	docs: '📚 Documentation',
	style: '💅 Styles',
	refactor: '♻️ Refactoring',
	perf: '⚡️ Performance',
	test: '✅ Tests',
	build: '📦 Build',
	ci: '👷 CI',
	chore: '🔧 Chores',
	revert: '⏪ Reverts',
}

export interface ChangelogOptions {
	/** GitHub repo URL for commit links (e.g., https://github.com/owner/repo) */
	repoUrl?: string
}

/**
 * Format commit link
 */
function formatCommitLink(hash: string, repoUrl?: string): string {
	const shortHash = hash.slice(0, 7)
	if (repoUrl) {
		return `([${shortHash}](${repoUrl}/commit/${hash}))`
	}
	return `(${shortHash})`
}

/**
 * Generate changelog entry for a version bump
 */
export function generateChangelogEntry(
	bump: VersionBump,
	config: BumpConfig,
	options?: ChangelogOptions
): string {
	const { newVersion, commits, bumpFileContent, changesetContent } = bump
	const date = new Date().toISOString().split('T')[0]
	const repoUrl = options?.repoUrl
	// Format is reserved for future use (different changelog formats)
	const _format = config.changelog?.format ?? 'github'

	const lines: string[] = []

	// Version header
	lines.push(`## ${newVersion} (${date})`)
	lines.push('')

	// Bump file content first (hand-written, takes priority)
	// Support both new and legacy field names
	const customContent = bumpFileContent || changesetContent
	if (customContent) {
		lines.push(customContent)
		lines.push('')
	}

	if (commits.length === 0) {
		// Check if this is a dependency update bump
		if (bump.updatedDeps && bump.updatedDeps.length > 0) {
			lines.push('### 📦 Dependencies')
			lines.push('')
			for (const dep of bump.updatedDeps) {
				lines.push(`- Updated \`${dep.name}\` to ${dep.version}`)
			}
		} else if (!customContent) {
			// Only show "No notable changes" if there's no custom content either
			lines.push('No notable changes.')
		}
		lines.push('')
		return lines.join('\n')
	}

	const groupBy = config.changelog?.groupBy ?? 'type'

	if (groupBy === 'type') {
		const groups = groupCommitsByType(commits)

		// Sort by type importance
		const typeOrder = [
			'feat',
			'fix',
			'perf',
			'refactor',
			'docs',
			'style',
			'test',
			'build',
			'ci',
			'chore',
			'revert',
		]

		for (const type of typeOrder) {
			const typeCommits = groups.get(type)
			if (!typeCommits || typeCommits.length === 0) continue

			const label = TYPE_LABELS[type] ?? type
			lines.push(`### ${label}`)
			lines.push('')

			for (const commit of typeCommits) {
				const scope = commit.scope ? `**${commit.scope}:** ` : ''
				const breaking = commit.breaking ? '💥 ' : ''
				const link = formatCommitLink(commit.hash, repoUrl)
				lines.push(`- ${breaking}${scope}${commit.subject} ${link}`)
			}
			lines.push('')
		}
	} else if (groupBy === 'scope') {
		// Group by scope
		const groups = new Map<string, ConventionalCommit[]>()
		for (const commit of commits) {
			const scope = commit.scope ?? 'general'
			const existing = groups.get(scope) ?? []
			existing.push(commit)
			groups.set(scope, existing)
		}

		for (const [scope, scopeCommits] of groups) {
			lines.push(`### ${scope}`)
			lines.push('')

			for (const commit of scopeCommits) {
				const breaking = commit.breaking ? '💥 ' : ''
				const link = formatCommitLink(commit.hash, repoUrl)
				lines.push(`- ${breaking}${commit.subject} ${link}`)
			}
			lines.push('')
		}
	} else {
		// No grouping
		for (const commit of commits) {
			const scope = commit.scope ? `**${commit.scope}:** ` : ''
			const breaking = commit.breaking ? '💥 ' : ''
			const link = formatCommitLink(commit.hash, repoUrl)
			lines.push(`- ${breaking}${scope}${commit.subject} ${link}`)
		}
		lines.push('')
	}

	// Add breaking changes section if any
	const breakingCommits = commits.filter((c) => c.breaking)
	if (breakingCommits.length > 0) {
		lines.push('### 💥 Breaking Changes')
		lines.push('')
		for (const commit of breakingCommits) {
			const scope = commit.scope ? `**${commit.scope}:** ` : ''
			const link = formatCommitLink(commit.hash, repoUrl)
			lines.push(`- ${scope}${commit.subject} ${link}`)
			if (commit.body) {
				const breakingNote = commit.body.match(/BREAKING[ -]CHANGE:\s*(.+?)(?:\n\n|$)/s)
				if (breakingNote) {
					lines.push(`  ${breakingNote[1]}`)
				}
			}
		}
		lines.push('')
	}

	return lines.join('\n')
}

/**
 * Update changelog file
 */
export function updateChangelog(cwd: string, entry: string, config: BumpConfig): void {
	const changelogFile = config.changelog?.file ?? 'CHANGELOG.md'
	const changelogPath = join(cwd, changelogFile)

	const existing = readFile(changelogPath)

	let newContent: string
	if (existing) {
		// Insert new entry after the title
		const titleMatch = existing.match(/^# .+?\n/)
		if (titleMatch && titleMatch.index !== undefined) {
			const afterTitle = titleMatch.index + titleMatch[0].length
			newContent = `${existing.slice(0, afterTitle)}\n${entry}\n${existing.slice(afterTitle).replace(/^\n+/, '')}`
		} else {
			newContent = `# Changelog\n\n${entry}\n${existing}`
		}
	} else {
		newContent = `# Changelog\n\n${entry}`
	}

	writeFile(changelogPath, newContent)
}

/**
 * Generate full changelog from all bumps
 */
export function generateFullChangelog(bumps: VersionBump[], config: BumpConfig): string {
	const entries: string[] = ['# Changelog', '']

	for (const bump of bumps) {
		entries.push(generateChangelogEntry(bump, config))
	}

	return entries.join('\n')
}
