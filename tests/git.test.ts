import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	clearTagCache,
	findTagForVersion,
	getTagsForPackage,
	parseGitHubRepo,
	parseVersionFromPackageTag,
	getGitRoot,
	getLatestTag,
	getAllTags,
	getLatestTagForPackage,
	getCurrentBranch,
	isWorkingTreeClean,
	getRemoteUrl,
	getGitHubRepoUrl,
	getCommitFiles,
	getCommitsSince,
	getCommitForTag,
	createTag,
	pushTags,
	stageFiles,
	commit,
	push,
} from '../src/utils/git.ts'

const TEST_DIR = '/tmp/bump-git-test'

describe('git utils', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
		mkdirSync(TEST_DIR, { recursive: true })
		clearTagCache()
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('parseGitHubRepo', () => {
		it('should parse SSH URL', () => {
			const result = parseGitHubRepo('git@github.com:owner/repo.git')

			expect(result).toEqual({ owner: 'owner', repo: 'repo' })
		})

		it('should parse SSH URL without .git suffix', () => {
			const result = parseGitHubRepo('git@github.com:owner/repo')

			expect(result).toEqual({ owner: 'owner', repo: 'repo' })
		})

		it('should parse HTTPS URL', () => {
			const result = parseGitHubRepo('https://github.com/owner/repo.git')

			expect(result).toEqual({ owner: 'owner', repo: 'repo' })
		})

		it('should parse HTTPS URL without .git suffix', () => {
			const result = parseGitHubRepo('https://github.com/owner/repo')

			expect(result).toEqual({ owner: 'owner', repo: 'repo' })
		})

		it('should parse HTTP URL', () => {
			const result = parseGitHubRepo('http://github.com/owner/repo.git')

			expect(result).toEqual({ owner: 'owner', repo: 'repo' })
		})

		it('should return null for non-GitHub URL', () => {
			expect(parseGitHubRepo('git@gitlab.com:owner/repo.git')).toBe(null)
			expect(parseGitHubRepo('https://gitlab.com/owner/repo')).toBe(null)
			expect(parseGitHubRepo('invalid-url')).toBe(null)
		})

		it('should handle orgs with hyphens', () => {
			const result = parseGitHubRepo('git@github.com:my-org/my-repo.git')

			expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' })
		})
	})

	describe('getTagsForPackage', () => {
		it('should filter tags for specific package', () => {
			const allTags = [
				'@scope/pkg-a@1.0.0',
				'@scope/pkg-a@1.1.0',
				'@scope/pkg-b@1.0.0',
				'v1.0.0',
			]

			const result = getTagsForPackage('@scope/pkg-a', allTags)

			expect(result).toEqual(['@scope/pkg-a@1.0.0', '@scope/pkg-a@1.1.0'])
		})

		it('should return empty array when no matching tags', () => {
			const allTags = ['@scope/pkg-b@1.0.0', 'v1.0.0']

			const result = getTagsForPackage('@scope/pkg-a', allTags)

			expect(result).toEqual([])
		})

		it('should handle unscoped package names', () => {
			const allTags = ['my-pkg@1.0.0', 'my-pkg@2.0.0', 'other-pkg@1.0.0']

			const result = getTagsForPackage('my-pkg', allTags)

			expect(result).toEqual(['my-pkg@1.0.0', 'my-pkg@2.0.0'])
		})
	})

	describe('parseVersionFromPackageTag', () => {
		it('should parse version from scoped package tag', () => {
			const result = parseVersionFromPackageTag('@scope/pkg@1.0.0', '@scope/pkg')

			expect(result).toBe('1.0.0')
		})

		it('should parse version from unscoped package tag', () => {
			const result = parseVersionFromPackageTag('my-pkg@2.3.4', 'my-pkg')

			expect(result).toBe('2.3.4')
		})

		it('should return null for non-matching tag', () => {
			const result = parseVersionFromPackageTag('@scope/other@1.0.0', '@scope/pkg')

			expect(result).toBe(null)
		})

		it('should handle prerelease versions', () => {
			const result = parseVersionFromPackageTag('@scope/pkg@1.0.0-alpha.1', '@scope/pkg')

			expect(result).toBe('1.0.0-alpha.1')
		})
	})

	describe('findTagForVersion', () => {
		it('should find monorepo package tag', () => {
			const allTags = ['@scope/pkg@1.0.0', '@scope/pkg@2.0.0', 'v1.0.0']

			const result = findTagForVersion('1.0.0', allTags, '@scope/pkg')

			expect(result).toBe('@scope/pkg@1.0.0')
		})

		it('should find single repo v-prefixed tag', () => {
			const allTags = ['v1.0.0', 'v2.0.0']

			const result = findTagForVersion('1.0.0', allTags)

			expect(result).toBe('v1.0.0')
		})

		it('should find single repo non-prefixed tag', () => {
			const allTags = ['1.0.0', '2.0.0']

			const result = findTagForVersion('1.0.0', allTags)

			expect(result).toBe('1.0.0')
		})

		it('should return null when tag not found', () => {
			const allTags = ['v1.0.0', 'v2.0.0']

			const result = findTagForVersion('3.0.0', allTags)

			expect(result).toBe(null)
		})

		it('should prefer v-prefixed tag for single repo', () => {
			const allTags = ['v1.0.0', '1.0.0']

			const result = findTagForVersion('1.0.0', allTags)

			expect(result).toBe('v1.0.0')
		})
	})

	describe('clearTagCache', () => {
		it('should not throw', () => {
			expect(() => clearTagCache()).not.toThrow()
		})
	})

	// Integration tests that require a real git repo
	describe('git integration (requires git)', () => {
		it('getGitRoot should return a path', async () => {
			// This test runs in the actual bump repo
			const root = await getGitRoot()
			expect(root).toContain('bump')
		})

		it('getAllTags should return array', async () => {
			const tags = await getAllTags()
			expect(Array.isArray(tags)).toBe(true)
		})

		it('getLatestTag should return tag or null', async () => {
			const tag = await getLatestTag()
			// May be null if no tags, or a string if tags exist
			expect(tag === null || typeof tag === 'string').toBe(true)
		})

		it('getLatestTag with pattern should filter', async () => {
			const tag = await getLatestTag('v*')
			expect(tag === null || tag.startsWith('v')).toBe(true)
		})

		it('getLatestTagForPackage should work', async () => {
			const tag = await getLatestTagForPackage('@sylphx/bump')
			expect(tag === null || tag.includes('@sylphx/bump@')).toBe(true)
		})

		it('getCurrentBranch should return branch name', async () => {
			const branch = await getCurrentBranch()
			expect(typeof branch).toBe('string')
			expect(branch.length).toBeGreaterThan(0)
		})

		it('isWorkingTreeClean should return boolean', async () => {
			const clean = await isWorkingTreeClean()
			expect(typeof clean).toBe('boolean')
		})

		it('getRemoteUrl should return url or null', async () => {
			const url = await getRemoteUrl()
			expect(url === null || typeof url === 'string').toBe(true)
		})

		it('getRemoteUrl should cache origin remote', async () => {
			const url1 = await getRemoteUrl('origin')
			const url2 = await getRemoteUrl('origin')
			expect(url1).toBe(url2)
		})

		it('getGitHubRepoUrl should return url or null', async () => {
			const url = await getGitHubRepoUrl()
			expect(url === null || url.includes('github.com')).toBe(true)
		})

		it('getCommitsSince should return commits array', async () => {
			const commits = await getCommitsSince()
			expect(Array.isArray(commits)).toBe(true)
			if (commits.length > 0) {
				expect(commits[0]).toHaveProperty('hash')
				expect(commits[0]).toHaveProperty('message')
				expect(commits[0]).toHaveProperty('files')
			}
		})

		it('getCommitsSince with ref should work', async () => {
			const allCommits = await getCommitsSince()
			if (allCommits.length > 1) {
				const firstHash = allCommits[allCommits.length - 1]?.hash
				if (firstHash) {
					const commits = await getCommitsSince(firstHash)
					expect(commits.length).toBeLessThan(allCommits.length)
				}
			}
		})

		it('getCommitFiles should return files for valid commit', async () => {
			const commits = await getCommitsSince()
			if (commits.length > 0 && commits[0]?.hash) {
				const files = await getCommitFiles(commits[0].hash)
				expect(Array.isArray(files)).toBe(true)
			}
		})

		it('getCommitFiles should return empty for invalid commit', async () => {
			const files = await getCommitFiles('invalid-hash-12345')
			expect(files).toEqual([])
		})

		it('getCommitForTag should return commit for valid tag', async () => {
			const tags = await getAllTags()
			if (tags.length > 0 && tags[0]) {
				const commit = await getCommitForTag(tags[0])
				expect(commit === null || typeof commit === 'string').toBe(true)
			}
		})

		it('getCommitForTag should return null for invalid tag', async () => {
			const commit = await getCommitForTag('nonexistent-tag-12345')
			expect(commit).toBe(null)
		})
	})
})
