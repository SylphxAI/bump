import { describe, expect, it } from 'bun:test'
import {
	determineReleaseType,
	fileMatchesPackage,
	filterCommitsForPackage,
	groupCommitsByType,
	parseConventionalCommit,
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
				breaking: false, graduate: false,
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
					breaking: true, graduate: false,
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
					breaking: false, graduate: false,
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
					breaking: false, graduate: false,
					raw: 'fix: fix',
					files: [],
				},
			]

			expect(determineReleaseType(commits, config)).toBe('patch')
		})

		it('should return highest type from multiple commits', () => {
			const commits: ConventionalCommit[] = [
				{ hash: '1', type: 'fix', subject: 'fix', breaking: false, graduate: false, raw: 'fix: fix', files: [] },
				{ hash: '2', type: 'feat', subject: 'feat', breaking: false, graduate: false, raw: 'feat: feat', files: [] },
			]

			expect(determineReleaseType(commits, config)).toBe('minor')
		})

		it('should return null for commits that dont trigger release', () => {
			const commits: ConventionalCommit[] = [
				{
					hash: 'abc',
					type: 'docs',
					subject: 'docs',
					breaking: false, graduate: false,
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
				{ hash: '1', type: 'feat', subject: 'feat 1', breaking: false, graduate: false, raw: '', files: [] },
				{ hash: '2', type: 'fix', subject: 'fix 1', breaking: false, graduate: false, raw: '', files: [] },
				{ hash: '3', type: 'feat', subject: 'feat 2', breaking: false, graduate: false, raw: '', files: [] },
			]

			const groups = groupCommitsByType(commits)

			expect(groups.get('feat')?.length).toBe(2)
			expect(groups.get('fix')?.length).toBe(1)
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
					breaking: false, graduate: false,
					raw: '',
					files: ['packages/foo/src/index.ts'],
				},
				{
					hash: '2',
					type: 'fix',
					subject: 'fix for bar',
					breaking: false, graduate: false,
					raw: '',
					files: ['packages/bar/src/index.ts'],
				},
				{
					hash: '3',
					type: 'feat',
					subject: 'feat for foo',
					breaking: false, graduate: false,
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
					breaking: false, graduate: false,
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
					breaking: false, graduate: false,
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
					breaking: false, graduate: false,
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
					breaking: false, graduate: false,
					raw: '',
					files: [],
				},
			]

			// @scope/foo should match scope 'foo'
			const filtered = filterCommitsForPackage(commits, '@scope/foo', 'packages/foo')
			expect(filtered.length).toBe(1)
		})
	})
})
