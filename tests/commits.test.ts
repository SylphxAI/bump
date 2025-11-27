import { describe, expect, it } from 'bun:test'
import {
	determineReleaseType,
	fileMatchesPackage,
	filterCommitsForPackage,
	groupCommitsByType,
	groupCommitsByScope,
	parseConventionalCommit,
	getConventionalCommits,
} from '../src/core/commits.ts'
import type { BumpConfig, ConventionalCommit } from '../src/types.ts'

describe('commits', () => {
	describe('parseConventionalCommit', () => {
		it('should parse basic commit', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'feat: add new feature',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result).toEqual({
				hash: 'abc123',
				type: 'feat',
				scope: undefined,
				subject: 'add new feature',
				body: undefined,
				breaking: false,
				graduate: false,
				raw: 'feat: add new feature',
				files: [],
			})
		})

		it('should parse commit with scope', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'fix(auth): resolve login issue',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.type).toBe('fix')
			expect(result?.scope).toBe('auth')
			expect(result?.subject).toBe('resolve login issue')
		})

		it('should parse breaking change with !', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'feat!: breaking change',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.breaking).toBe(true)
		})

		it('should parse breaking change in body', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'feat: add feature',
				body: 'BREAKING CHANGE: this breaks things',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.breaking).toBe(true)
		})

		it('should parse breaking change with hyphen in body', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'feat: add feature',
				body: 'BREAKING-CHANGE: this breaks things',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.breaking).toBe(true)
		})

		it('should parse commit with scope and breaking !', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'feat(api)!: breaking api change',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.type).toBe('feat')
			expect(result?.scope).toBe('api')
			expect(result?.breaking).toBe(true)
			expect(result?.subject).toBe('breaking api change')
		})

		it('should return null for non-conventional commit', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'random commit message',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result).toBe(null)
		})

		it('should preserve files from git commit', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'feat: add feature',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: ['packages/foo/src/index.ts', 'packages/foo/package.json'],
			})

			expect(result?.files).toEqual(['packages/foo/src/index.ts', 'packages/foo/package.json'])
		})
	})

	describe('determineReleaseType', () => {
		const config: BumpConfig = {
			conventional: {
				types: {
					feat: 'minor',
					fix: 'patch',
					docs: null,
				},
			},
		}

		it('should return major for breaking changes', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: 'abc',
					type: 'feat',
					subject: 'breaking',
					breaking: true,
					graduate: false,
					raw: 'feat!: breaking',
					files: [],
				},
			]

			expect(determineReleaseType(commits, config)).toBe('major')
		})

		it('should return minor for features', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: 'abc',
					type: 'feat',
					subject: 'feature',
					breaking: false,
					graduate: false,
					raw: 'feat: feature',
					files: [],
				},
			]

			expect(determineReleaseType(commits, config)).toBe('minor')
		})

		it('should return patch for fixes', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: 'abc',
					type: 'fix',
					subject: 'fix',
					breaking: false,
					graduate: false,
					raw: 'fix: fix',
					files: [],
				},
			]

			expect(determineReleaseType(commits, config)).toBe('patch')
		})

		it('should return highest type from multiple commits', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'fix',
					subject: 'fix',
					breaking: false,
					graduate: false,
					raw: 'fix: fix',
					files: [],
				},
				{
					hash: '2',
					type: 'feat',
					subject: 'feat',
					breaking: false,
					graduate: false,
					raw: 'feat: feat',
					files: [],
				},
			]

			expect(determineReleaseType(commits, config)).toBe('minor')
		})

		it('should return null for commits that dont trigger release', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: 'abc',
					type: 'docs',
					subject: 'docs',
					breaking: false,
					graduate: false,
					raw: 'docs: docs',
					files: [],
				},
			]

			expect(determineReleaseType(commits, config)).toBe(null)
		})
	})

	describe('groupCommitsByType', () => {
		it('should group commits by type', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					subject: 'feat 1',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
				{
					hash: '2',
					type: 'fix',
					subject: 'fix 1',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
				{
					hash: '3',
					type: 'feat',
					subject: 'feat 2',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
			]

			const groups = groupCommitsByType(commits)

			expect(groups.get('feat')?.length).toBe(2)
			expect(groups.get('fix')?.length).toBe(1)
		})
	})

	describe('groupCommitsByScope', () => {
		it('should group commits by scope', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					scope: 'auth',
					subject: 'feat 1',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
				{
					hash: '2',
					type: 'fix',
					scope: 'auth',
					subject: 'fix 1',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
				{
					hash: '3',
					type: 'feat',
					scope: 'db',
					subject: 'feat 2',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
			]

			const groups = groupCommitsByScope(commits)

			expect(groups.get('auth')?.length).toBe(2)
			expect(groups.get('db')?.length).toBe(1)
		})

		it('should use "other" for commits without scope', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					subject: 'feat 1',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
			]

			const groups = groupCommitsByScope(commits)

			expect(groups.get('other')?.length).toBe(1)
		})
	})

	describe('fileMatchesPackage', () => {
		it('should match files within package directory', () => {
			expect(fileMatchesPackage('packages/foo/src/index.ts', 'packages/foo')).toBe(true)
			expect(fileMatchesPackage('packages/foo/package.json', 'packages/foo')).toBe(true)
		})

		it('should not match files outside package directory', () => {
			expect(fileMatchesPackage('packages/bar/src/index.ts', 'packages/foo')).toBe(false)
			expect(fileMatchesPackage('src/index.ts', 'packages/foo')).toBe(false)
		})

		it('should handle root package (empty or . path)', () => {
			expect(fileMatchesPackage('src/index.ts', '')).toBe(true)
			expect(fileMatchesPackage('src/index.ts', '.')).toBe(true)
		})

		it('should handle absolute paths with gitRoot', () => {
			const gitRoot = '/Users/test/project'
			expect(
				fileMatchesPackage('packages/foo/src/index.ts', '/Users/test/project/packages/foo', gitRoot)
			).toBe(true)
		})
	})

	describe('filterCommitsForPackage', () => {
		it('should filter commits by file path', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					subject: 'feat for foo',
					breaking: false,
					graduate: false,
					raw: '',
					files: ['packages/foo/src/index.ts'],
				},
				{
					hash: '2',
					type: 'fix',
					subject: 'fix for bar',
					breaking: false,
					graduate: false,
					raw: '',
					files: ['packages/bar/src/index.ts'],
				},
				{
					hash: '3',
					type: 'feat',
					subject: 'feat for foo',
					breaking: false,
					graduate: false,
					raw: '',
					files: ['packages/foo/package.json'],
				},
			]

			const filtered = filterCommitsForPackage(commits, '@scope/foo', 'packages/foo')
			expect(filtered.length).toBe(2)
			expect(filtered.map((c) => c.hash)).toEqual(['1', '3'])
		})

		it('should NOT include commits with unrelated files even without scope', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					subject: 'global feature',
					breaking: false,
					graduate: false,
					raw: '',
					files: ['README.md'], // File not in packages/foo
				},
			]

			// When files are available, use file-based detection (strict)
			const filtered = filterCommitsForPackage(commits, '@scope/foo', 'packages/foo')
			expect(filtered.length).toBe(0)
		})

		it('should include commits without files and without scope (legacy behavior)', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					subject: 'global feature',
					breaking: false,
					graduate: false,
					raw: '',
					files: [], // No file info available
				},
			]

			// Without file info, falls back to scope-based (no scope = affects all)
			const filtered = filterCommitsForPackage(commits, '@scope/foo', 'packages/foo')
			expect(filtered.length).toBe(1)
		})

		it('should fall back to scope matching when no files', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					scope: 'foo',
					subject: 'feat for foo',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
			]

			const filtered = filterCommitsForPackage(commits, '@scope/foo', 'packages/foo')
			expect(filtered.length).toBe(1)
		})

		it('should match short package name from scoped package', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: '1',
					type: 'feat',
					scope: 'foo',
					subject: 'feat for foo',
					breaking: false,
					graduate: false,
					raw: '',
					files: [],
				},
			]

			// @scope/foo should match scope 'foo'
			const filtered = filterCommitsForPackage(commits, '@scope/foo', 'packages/foo')
			expect(filtered.length).toBe(1)
		})
	})

	describe('getConventionalCommits (integration)', () => {
		it('should return conventional commits from git history', async () => {
			// This test uses the actual bump repo
			const commits = await getConventionalCommits()
			expect(Array.isArray(commits)).toBe(true)
			// The bump repo should have conventional commits
			if (commits.length > 0) {
				expect(commits[0]).toHaveProperty('type')
				expect(commits[0]).toHaveProperty('subject')
				expect(commits[0]).toHaveProperty('hash')
			}
		})

		it('should filter out non-conventional commits', async () => {
			const commits = await getConventionalCommits()
			// All returned commits should have a type
			for (const commit of commits) {
				expect(commit.type).toBeDefined()
				expect(commit.type.length).toBeGreaterThan(0)
			}
		})

		it('should filter out release commits', async () => {
			const commits = await getConventionalCommits()
			// None of the commits should be release commits
			for (const commit of commits) {
				// Release commits have type 'chore' and scope 'release'
				if (commit.type === 'chore' && commit.scope === 'release') {
					// This would fail if release commits are not filtered
					expect(true).toBe(false)
				}
			}
		})

		it('should work with a ref parameter', async () => {
			// Get all commits first
			const allCommits = await getConventionalCommits()
			if (allCommits.length > 5) {
				// Get commits since a recent commit
				const ref = allCommits[4]?.hash
				if (ref) {
					const recentCommits = await getConventionalCommits(ref)
					expect(recentCommits.length).toBeLessThanOrEqual(4)
				}
			}
		})
	})

	describe('isReleaseCommit (via parseConventionalCommit)', () => {
		// The isReleaseCommit function is internal, but we can test its behavior
		// through getConventionalCommits which filters release commits

		it('should identify chore(release) as release commit pattern', () => {
			// This tests the pattern matching in parseConventionalCommit
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'chore(release): 1.0.0',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			// The commit should be parsed successfully
			expect(result?.type).toBe('chore')
			expect(result?.scope).toBe('release')
			expect(result?.subject).toBe('1.0.0')
		})

		it('should parse version-like subjects', () => {
			// Test that version subjects are parsed
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'chore(release): v1.2.3',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.subject).toBe('v1.2.3')
		})

		it('should parse scoped package version subjects', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'chore(release): @scope/pkg@1.0.0',
				body: '',
				author: 'test',
				date: '2024-01-01',
				files: [],
			})

			expect(result?.subject).toBe('@scope/pkg@1.0.0')
		})
	})
})
