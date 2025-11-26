import { describe, expect, it } from 'bun:test'
import {
	determineReleaseType,
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
			})

			expect(result).toEqual({
				hash: 'abc123',
				type: 'feat',
				scope: undefined,
				subject: 'add new feature',
				body: undefined,
				breaking: false,
				raw: 'feat: add new feature',
			})
		})

		it('should parse commit with scope', () => {
			const result = parseConventionalCommit({
				hash: 'abc123',
				message: 'fix(auth): resolve login issue',
				body: '',
				author: 'test',
				date: '2024-01-01',
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
			})

			expect(result).toBe(null)
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
					raw: 'feat!: breaking',
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
					raw: 'feat: feature',
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
					raw: 'fix: fix',
				},
			]

			expect(determineReleaseType(commits, config)).toBe('patch')
		})

		it('should return highest type from multiple commits', () => {
			const commits: ConventionalCommit[] = [
				{ hash: '1', type: 'fix', subject: 'fix', breaking: false, raw: 'fix: fix' },
				{ hash: '2', type: 'feat', subject: 'feat', breaking: false, raw: 'feat: feat' },
			]

			expect(determineReleaseType(commits, config)).toBe('minor')
		})

		it('should return null for commits that dont trigger release', () => {
			const commits: ConventionalCommit[] = [
				{ hash: 'abc', type: 'docs', subject: 'docs', breaking: false, raw: 'docs: docs' },
			]

			expect(determineReleaseType(commits, config)).toBe(null)
		})
	})

	describe('groupCommitsByType', () => {
		it('should group commits by type', () => {
			const commits: ConventionalCommit[] = [
				{ hash: '1', type: 'feat', subject: 'feat 1', breaking: false, raw: '' },
				{ hash: '2', type: 'fix', subject: 'fix 1', breaking: false, raw: '' },
				{ hash: '3', type: 'feat', subject: 'feat 2', breaking: false, raw: '' },
			]

			const groups = groupCommitsByType(commits)

			expect(groups.get('feat')?.length).toBe(2)
			expect(groups.get('fix')?.length).toBe(1)
		})
	})
})
