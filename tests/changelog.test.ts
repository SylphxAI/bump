import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	generateChangelogEntry,
	generateFullChangelog,
	updateChangelog,
} from '../src/core/changelog.ts'
import type { BumpConfig, ConventionalCommit, VersionBump } from '../src/types.ts'

const TEST_DIR = '/tmp/bump-changelog-test'

describe('changelog', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
		mkdirSync(TEST_DIR, { recursive: true })
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('generateChangelogEntry', () => {
		const defaultConfig: BumpConfig = {
			changelog: { groupBy: 'type' },
		}

		const createCommit = (overrides: Partial<ConventionalCommit> = {}): ConventionalCommit => ({
			hash: 'abc1234567890',
			type: 'feat',
			subject: 'add new feature',
			breaking: false,
			graduate: false,
			raw: 'feat: add new feature',
			files: [],
			...overrides,
		})

		it('should generate basic changelog entry with no commits', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('## 1.1.0')
			expect(entry).toContain('No notable changes.')
		})

		it('should show dependency updates when no commits but updatedDeps present', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.0.1',
				releaseType: 'patch',
				commits: [],
				updatedDeps: [
					{ name: '@scope/dep', version: '2.0.0' },
					{ name: 'another-dep', version: '3.0.0' },
				],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('### 📦 Dependencies')
			expect(entry).toContain('Updated `@scope/dep` to 2.0.0')
			expect(entry).toContain('Updated `another-dep` to 3.0.0')
		})

		it('should group commits by type', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [
					createCommit({ hash: '111', type: 'feat', subject: 'add feature 1' }),
					createCommit({ hash: '222', type: 'fix', subject: 'fix bug 1' }),
					createCommit({ hash: '333', type: 'feat', subject: 'add feature 2' }),
				],
			}

			const entry = generateChangelogEntry(bump, { changelog: { groupBy: 'type' } })

			expect(entry).toContain('### ✨ Features')
			expect(entry).toContain('add feature 1')
			expect(entry).toContain('add feature 2')
			expect(entry).toContain('### 🐛 Bug Fixes')
			expect(entry).toContain('fix bug 1')
		})

		it('should group commits by scope', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [
					createCommit({ hash: '111', type: 'feat', scope: 'auth', subject: 'add auth feature' }),
					createCommit({ hash: '222', type: 'fix', scope: 'auth', subject: 'fix auth bug' }),
					createCommit({ hash: '333', type: 'feat', subject: 'global feature' }),
				],
			}

			const entry = generateChangelogEntry(bump, { changelog: { groupBy: 'scope' } })

			expect(entry).toContain('### auth')
			expect(entry).toContain('add auth feature')
			expect(entry).toContain('fix auth bug')
			expect(entry).toContain('### general')
			expect(entry).toContain('global feature')
		})

		it('should handle no grouping', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [
					createCommit({ hash: '111', type: 'feat', subject: 'feature 1' }),
					createCommit({ hash: '222', type: 'fix', subject: 'fix 1' }),
				],
			}

			const entry = generateChangelogEntry(bump, { changelog: { groupBy: 'none' } })

			// Should list commits without type headers
			expect(entry).toContain('- feature 1')
			expect(entry).toContain('- fix 1')
			expect(entry).not.toContain('### ✨ Features')
		})

		it('should include commit links with repoUrl', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [createCommit({ hash: 'abc1234567890' })],
			}

			const entry = generateChangelogEntry(bump, defaultConfig, {
				repoUrl: 'https://github.com/owner/repo',
			})

			expect(entry).toContain('[abc1234](https://github.com/owner/repo/commit/abc1234567890)')
		})

		it('should include short hash without repoUrl', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [createCommit({ hash: 'abc1234567890' })],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('(abc1234)')
			expect(entry).not.toContain('https://')
		})

		it('should mark breaking changes with emoji', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '2.0.0',
				releaseType: 'major',
				commits: [
					createCommit({
						hash: '111',
						type: 'feat',
						subject: 'breaking feature',
						breaking: true,
					}),
				],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('💥 breaking feature')
		})

		it('should add breaking changes section', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '2.0.0',
				releaseType: 'major',
				commits: [
					createCommit({
						hash: '111',
						type: 'feat',
						subject: 'breaking api change',
						breaking: true,
						body: 'BREAKING CHANGE: The API has changed completely.',
					}),
				],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('### 💥 Breaking Changes')
			expect(entry).toContain('breaking api change')
			expect(entry).toContain('The API has changed completely.')
		})

		it('should include scope in commit message', () => {
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [createCommit({ hash: '111', type: 'feat', scope: 'auth', subject: 'add login' })],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('**auth:** add login')
		})

		it('should handle all commit types', () => {
			const types = [
				'feat',
				'fix',
				'docs',
				'style',
				'refactor',
				'perf',
				'test',
				'build',
				'ci',
				'chore',
				'revert',
			]
			const commits = types.map((type, i) =>
				createCommit({ hash: `${i}00`, type, subject: `${type} change` })
			)

			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits,
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			expect(entry).toContain('✨ Features')
			expect(entry).toContain('🐛 Bug Fixes')
			expect(entry).toContain('📚 Documentation')
			expect(entry).toContain('💅 Styles')
			expect(entry).toContain('♻️ Refactoring')
			expect(entry).toContain('⚡️ Performance')
			expect(entry).toContain('✅ Tests')
			expect(entry).toContain('📦 Build')
			expect(entry).toContain('👷 CI')
			expect(entry).toContain('🔧 Chores')
			expect(entry).toContain('⏪ Reverts')
		})

		it('should skip types not in typeOrder when grouping by type', () => {
			// Unknown types are not included in the typeOrder list
			// so they won't be displayed when grouping by type
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [createCommit({ hash: '111', type: 'unknown', subject: 'unknown change' })],
			}

			const entry = generateChangelogEntry(bump, defaultConfig)

			// Unknown types are skipped in type grouping
			expect(entry).not.toContain('unknown change')
		})

		it('should include all commits when grouping by none', () => {
			// With no grouping, all commits are shown regardless of type
			const bump: VersionBump = {
				package: 'test-pkg',
				currentVersion: '1.0.0',
				newVersion: '1.1.0',
				releaseType: 'minor',
				commits: [createCommit({ hash: '111', type: 'custom', subject: 'custom change' })],
			}

			const entry = generateChangelogEntry(bump, { changelog: { groupBy: 'none' } })

			expect(entry).toContain('custom change')
		})
	})

	describe('updateChangelog', () => {
		it('should create new changelog if none exists', () => {
			const entry = '## 1.0.0\n\nNew release'
			updateChangelog(TEST_DIR, entry, {})

			const content = readFileSync(join(TEST_DIR, 'CHANGELOG.md'), 'utf-8')
			expect(content).toContain('# Changelog')
			expect(content).toContain('## 1.0.0')
		})

		it('should insert entry after title in existing changelog', () => {
			const existingChangelog = '# Changelog\n\n## 0.9.0\n\nOld release'
			writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), existingChangelog)

			const entry = '## 1.0.0\n\nNew release'
			updateChangelog(TEST_DIR, entry, {})

			const content = readFileSync(join(TEST_DIR, 'CHANGELOG.md'), 'utf-8')
			expect(content).toContain('# Changelog')
			expect(content.indexOf('## 1.0.0')).toBeLessThan(content.indexOf('## 0.9.0'))
		})

		it('should add title if existing changelog has no title', () => {
			const existingChangelog = '## 0.9.0\n\nOld release'
			writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), existingChangelog)

			const entry = '## 1.0.0\n\nNew release'
			updateChangelog(TEST_DIR, entry, {})

			const content = readFileSync(join(TEST_DIR, 'CHANGELOG.md'), 'utf-8')
			expect(content).toContain('# Changelog')
		})

		it('should use custom changelog file from config', () => {
			const entry = '## 1.0.0\n\nNew release'
			updateChangelog(TEST_DIR, entry, { changelog: { file: 'HISTORY.md' } })

			expect(existsSync(join(TEST_DIR, 'HISTORY.md'))).toBe(true)
			expect(existsSync(join(TEST_DIR, 'CHANGELOG.md'))).toBe(false)
		})
	})

	describe('generateFullChangelog', () => {
		it('should generate full changelog from multiple bumps', () => {
			const bumps: VersionBump[] = [
				{
					package: 'test-pkg',
					currentVersion: '1.0.0',
					newVersion: '1.1.0',
					releaseType: 'minor',
					commits: [
						{
							hash: '111',
							type: 'feat',
							subject: 'feature 1',
							breaking: false,
							graduate: false,
							raw: '',
							files: [],
						},
					],
				},
				{
					package: 'test-pkg',
					currentVersion: '0.9.0',
					newVersion: '1.0.0',
					releaseType: 'major',
					commits: [
						{
							hash: '222',
							type: 'feat',
							subject: 'feature 0',
							breaking: true,
							graduate: false,
							raw: '',
							files: [],
						},
					],
				},
			]

			const changelog = generateFullChangelog(bumps, {})

			expect(changelog).toContain('# Changelog')
			expect(changelog).toContain('## 1.1.0')
			expect(changelog).toContain('## 1.0.0')
		})
	})
})
