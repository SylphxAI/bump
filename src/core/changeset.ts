/**
 * Bump file system - manual release trigger and custom changelog support
 *
 * Bump files are markdown files in .bump/ directory that allow:
 * 1. Manual version specification (for blocked version recovery)
 * 2. Custom changelog entries
 * 3. Explicit release triggers
 *
 * File format:
 * ---
 * release: patch | minor | major | "1.2.3"
 * package: @scope/pkg        # single package (optional)
 * packages:                  # multiple packages (optional)
 *   - @scope/core
 *   - @scope/utils
 * ---
 *
 * Custom changelog content here.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReleaseType } from '../types.ts'

export interface BumpFile {
	/** Unique identifier (filename without extension) */
	id: string
	/** File path */
	path: string
	/** Release type or explicit version */
	release: ReleaseType | string
	/** Single package name (for monorepo, optional) */
	package?: string
	/** Multiple package names (for monorepo, optional) */
	packages?: string[]
	/** Custom changelog content */
	content: string
}

export interface BumpState {
	/** Last processed commit hash */
	lastProcessedCommit: string | null
	/** Timestamp of last processing */
	lastProcessedAt: string | null
}

const BUMP_DIR = '.bump'
const STATE_FILE = 'state.json'

/**
 * Get the .bump directory path
 */
export function getBumpDir(cwd: string): string {
	return join(cwd, BUMP_DIR)
}

/**
 * Get the state file path
 */
export function getStateFilePath(cwd: string): string {
	return join(getBumpDir(cwd), STATE_FILE)
}

/**
 * Check if .bump directory exists
 */
export function hasBumpDir(cwd: string): boolean {
	return existsSync(getBumpDir(cwd))
}

/**
 * Read bump state
 */
export function readBumpState(cwd: string): BumpState {
	const statePath = getStateFilePath(cwd)
	if (!existsSync(statePath)) {
		return { lastProcessedCommit: null, lastProcessedAt: null }
	}
	try {
		const content = readFileSync(statePath, 'utf-8')
		return JSON.parse(content)
	} catch {
		return { lastProcessedCommit: null, lastProcessedAt: null }
	}
}

/**
 * Write bump state
 */
export function writeBumpState(cwd: string, state: BumpState): void {
	const bumpDir = getBumpDir(cwd)
	if (!existsSync(bumpDir)) {
		const { mkdirSync } = require('node:fs')
		mkdirSync(bumpDir, { recursive: true })
	}
	const statePath = getStateFilePath(cwd)
	writeFileSync(statePath, JSON.stringify(state, null, '\t') + '\n')
}

/**
 * Parse frontmatter from markdown content
 * Returns [frontmatter object, content after frontmatter]
 * Supports both simple key: value and YAML arrays (key:\n  - item1\n  - item2)
 */
function parseFrontmatter(content: string): [Record<string, string | string[]>, string] {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/
	const match = content.match(frontmatterRegex)

	if (!match) {
		return [{}, content.trim()]
	}

	const [, frontmatterStr, bodyContent] = match
	const frontmatter: Record<string, string | string[]> = {}

	if (frontmatterStr) {
		const lines = frontmatterStr.split('\n')
		let i = 0

		while (i < lines.length) {
			const line = lines[i]
			const colonIndex = line.indexOf(':')

			if (colonIndex > 0) {
				const key = line.slice(0, colonIndex).trim()
				let value = line.slice(colonIndex + 1).trim()

				// Check if this is an array (value is empty and next lines start with "  -")
				if (value === '' && i + 1 < lines.length && lines[i + 1]?.match(/^\s+-/)) {
					const items: string[] = []
					i++
					while (i < lines.length && lines[i]?.match(/^\s+-/)) {
						let item = lines[i].replace(/^\s+-\s*/, '').trim()
						// Remove quotes if present
						if (
							(item.startsWith('"') && item.endsWith('"')) ||
							(item.startsWith("'") && item.endsWith("'"))
						) {
							item = item.slice(1, -1)
						}
						items.push(item)
						i++
					}
					frontmatter[key] = items
					continue
				}

				// Remove quotes if present
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1)
				}
				frontmatter[key] = value
			}
			i++
		}
	}

	return [frontmatter, (bodyContent ?? '').trim()]
}

/**
 * Parse a single bump file
 */
export function parseBumpFile(filePath: string): BumpFile | null {
	if (!existsSync(filePath)) return null

	try {
		const rawContent = readFileSync(filePath, 'utf-8')
		const [frontmatter, content] = parseFrontmatter(rawContent)

		// release is required
		if (!frontmatter.release) {
			return null
		}

		const id = filePath.split('/').pop()?.replace(/\.md$/, '') ?? ''
		const release = frontmatter.release as string

		// Handle package (single) and packages (array)
		const pkg = typeof frontmatter.package === 'string' ? frontmatter.package : undefined
		const pkgs = Array.isArray(frontmatter.packages) ? frontmatter.packages : undefined

		return {
			id,
			path: filePath,
			release,
			package: pkg,
			packages: pkgs,
			content,
		}
	} catch {
		return null
	}
}

/**
 * Read all bump files from .bump directory
 */
export function readBumpFiles(cwd: string): BumpFile[] {
	const bumpDir = getBumpDir(cwd)
	if (!existsSync(bumpDir)) return []

	const bumpFiles: BumpFile[] = []

	try {
		const files = readdirSync(bumpDir)
		for (const file of files) {
			// Skip state.json and non-markdown files
			if (file === STATE_FILE || !file.endsWith('.md')) continue

			const filePath = join(bumpDir, file)
			const bumpFile = parseBumpFile(filePath)
			if (bumpFile) {
				bumpFiles.push(bumpFile)
			}
		}
	} catch {
		// Directory doesn't exist or can't be read
	}

	return bumpFiles
}

/**
 * Consume (delete) bump files after processing
 */
export function consumeBumpFiles(bumpFiles: BumpFile[]): void {
	for (const bumpFile of bumpFiles) {
		try {
			unlinkSync(bumpFile.path)
		} catch {
			// Ignore errors
		}
	}
}

/**
 * Check if release is an explicit version (e.g., "1.2.3") vs release type
 */
export function isExplicitVersion(release: string): boolean {
	return /^\d+\.\d+\.\d+/.test(release)
}

/**
 * Get the highest release type from bump files
 * Returns null if all bump files have explicit versions
 */
export function getHighestReleaseType(bumpFiles: BumpFile[]): ReleaseType | null {
	const priority: Record<string, number> = {
		major: 3,
		minor: 2,
		patch: 1,
	}

	let highest: ReleaseType | null = null
	let highestPriority = 0

	for (const bf of bumpFiles) {
		if (isExplicitVersion(bf.release)) continue

		const p = priority[bf.release] ?? 0
		if (p > highestPriority) {
			highestPriority = p
			highest = bf.release as ReleaseType
		}
	}

	return highest
}

/**
 * Get explicit version from bump files (if any)
 * Returns the highest explicit version if multiple exist
 */
export function getExplicitVersion(bumpFiles: BumpFile[]): string | null {
	const semver = require('semver')
	let highest: string | null = null

	for (const bf of bumpFiles) {
		if (!isExplicitVersion(bf.release)) continue

		if (!highest || semver.gt(bf.release, highest)) {
			highest = bf.release
		}
	}

	return highest
}

/**
 * Filter bump files for a specific package (monorepo support)
 */
export function filterBumpFilesForPackage(bumpFiles: BumpFile[], packageName: string): BumpFile[] {
	return bumpFiles.filter((bf) => {
		// No package/packages specified = applies to all (or single package mode)
		if (!bf.package && !bf.packages) return true
		// Check single package field
		if (bf.package === packageName) return true
		// Check packages array
		if (bf.packages?.includes(packageName)) return true
		return false
	})
}

/**
 * Generate changelog content from bump files
 * Returns the combined content, ready to be prepended to auto-generated changelog
 */
export function generateBumpFileChangelog(bumpFiles: BumpFile[]): string {
	if (bumpFiles.length === 0) return ''

	const contents = bumpFiles.map((bf) => bf.content).filter((c) => c.length > 0)

	return contents.join('\n\n')
}

// Legacy aliases for backward compatibility during migration
/** @deprecated Use BumpFile instead */
export type Changeset = BumpFile
/** @deprecated Use BumpState instead */
export type ChangesetState = BumpState
/** @deprecated Use readBumpFiles instead */
export const readChangesets = readBumpFiles
/** @deprecated Use parseBumpFile instead */
export const parseChangeset = parseBumpFile
/** @deprecated Use consumeBumpFiles instead */
export const consumeChangesets = consumeBumpFiles
/** @deprecated Use readBumpState instead */
export const readChangesetState = readBumpState
/** @deprecated Use writeBumpState instead */
export const writeChangesetState = writeBumpState
/** @deprecated Use filterBumpFilesForPackage instead */
export const filterChangesetsForPackage = filterBumpFilesForPackage
/** @deprecated Use generateBumpFileChangelog instead */
export const generateChangesetChangelog = generateBumpFileChangelog
