import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	filterBumpFilesForPackage,
	getPrerelease,
	parseBumpFile,
	readBumpFiles,
	type BumpFile,
} from '../src/core/bumpfile.ts'

const TEST_DIR = join(import.meta.dir, '.test-bumpfile')
const BUMP_DIR = join(TEST_DIR, '.bump')

describe('bumpfile', () => {
	beforeEach(() => {
		mkdirSync(BUMP_DIR, { recursive: true })
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('parseBumpFile', () => {
		it('should parse simple bump file', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
release: minor
---

Added new feature.
`
			)

			const result = parseBumpFile(filePath)
			expect(result).not.toBeNull()
			expect(result?.release).toBe('minor')
			expect(result?.content).toBe('Added new feature.')
			expect(result?.package).toBeUndefined()
			expect(result?.packages).toBeUndefined()
		})

		it('should parse bump file with single package', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
release: patch
package: @scope/core
---

Bug fix.
`
			)

			const result = parseBumpFile(filePath)
			expect(result?.release).toBe('patch')
			expect(result?.package).toBe('@scope/core')
			expect(result?.packages).toBeUndefined()
		})

		it('should parse bump file with multiple packages', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
release: minor
packages:
  - @scope/core
  - @scope/utils
  - @scope/cli
---

Shared feature across packages.
`
			)

			const result = parseBumpFile(filePath)
			expect(result?.release).toBe('minor')
			expect(result?.package).toBeUndefined()
			expect(result?.packages).toEqual(['@scope/core', '@scope/utils', '@scope/cli'])
		})

		it('should parse explicit version', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
release: "1.2.3"
package: @scope/core
---

Recovery release.
`
			)

			const result = parseBumpFile(filePath)
			expect(result?.release).toBe('1.2.3')
		})

		it('should return null for file without release', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
package: @scope/core
---

Missing release field.
`
			)

			const result = parseBumpFile(filePath)
			expect(result).toBeNull()
		})

		it('should parse bump file with prerelease', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
release: minor
prerelease: beta
---

Beta feature.
`
			)

			const result = parseBumpFile(filePath)
			expect(result?.release).toBe('minor')
			expect(result?.prerelease).toBe('beta')
		})

		it('should parse bump file with prerelease and package', () => {
			const filePath = join(BUMP_DIR, 'test.md')
			writeFileSync(
				filePath,
				`---
release: minor
prerelease: alpha
package: @scope/core
---

Alpha release for core.
`
			)

			const result = parseBumpFile(filePath)
			expect(result?.release).toBe('minor')
			expect(result?.prerelease).toBe('alpha')
			expect(result?.package).toBe('@scope/core')
		})
	})

	describe('readBumpFiles', () => {
		it('should read all bump files from directory', () => {
			writeFileSync(
				join(BUMP_DIR, 'a.md'),
				`---
release: minor
---
Feature A.
`
			)
			writeFileSync(
				join(BUMP_DIR, 'b.md'),
				`---
release: patch
---
Fix B.
`
			)
			// Non-md file should be ignored
			writeFileSync(join(BUMP_DIR, 'ignore.txt'), 'ignored')

			const results = readBumpFiles(TEST_DIR)
			expect(results).toHaveLength(2)
			expect(results.map((r) => r.id).sort()).toEqual(['a', 'b'])
		})

		it('should return empty array when .bump directory does not exist', () => {
			rmSync(BUMP_DIR, { recursive: true })
			const results = readBumpFiles(TEST_DIR)
			expect(results).toEqual([])
		})
	})

	describe('filterBumpFilesForPackage', () => {
		const bumpFiles: BumpFile[] = [
			{ id: 'global', path: '', release: 'minor', content: 'Global' },
			{ id: 'core', path: '', release: 'patch', package: '@scope/core', content: 'Core' },
			{ id: 'multi', path: '', release: 'minor', packages: ['@scope/core', '@scope/utils'], content: 'Multi' },
			{ id: 'other', path: '', release: 'patch', package: '@scope/other', content: 'Other' },
		]

		it('should return global bump files for any package', () => {
			const result = filterBumpFilesForPackage(bumpFiles, '@scope/core')
			expect(result.map((r) => r.id)).toContain('global')
		})

		it('should filter by single package field', () => {
			const result = filterBumpFilesForPackage(bumpFiles, '@scope/core')
			expect(result.map((r) => r.id)).toContain('core')
			expect(result.map((r) => r.id)).not.toContain('other')
		})

		it('should filter by packages array', () => {
			const coreResult = filterBumpFilesForPackage(bumpFiles, '@scope/core')
			expect(coreResult.map((r) => r.id)).toContain('multi')

			const utilsResult = filterBumpFilesForPackage(bumpFiles, '@scope/utils')
			expect(utilsResult.map((r) => r.id)).toContain('multi')
			expect(utilsResult.map((r) => r.id)).toContain('global')
			expect(utilsResult.map((r) => r.id)).not.toContain('core')
		})

		it('should return only global for unmatched package', () => {
			const result = filterBumpFilesForPackage(bumpFiles, '@scope/unknown')
			expect(result).toHaveLength(1)
			expect(result[0]?.id).toBe('global')
		})
	})

	describe('getPrerelease', () => {
		it('should return prerelease from bump file', () => {
			const bumpFiles: BumpFile[] = [
				{ id: 'beta', path: '', release: 'minor', prerelease: 'beta', content: 'Beta' },
			]
			expect(getPrerelease(bumpFiles)).toBe('beta')
		})

		it('should return first prerelease when multiple exist', () => {
			const bumpFiles: BumpFile[] = [
				{ id: 'alpha', path: '', release: 'minor', prerelease: 'alpha', content: 'Alpha' },
				{ id: 'beta', path: '', release: 'minor', prerelease: 'beta', content: 'Beta' },
			]
			expect(getPrerelease(bumpFiles)).toBe('alpha')
		})

		it('should return null when no prerelease', () => {
			const bumpFiles: BumpFile[] = [
				{ id: 'stable', path: '', release: 'minor', content: 'Stable' },
			]
			expect(getPrerelease(bumpFiles)).toBeNull()
		})

		it('should return null for empty array', () => {
			expect(getPrerelease([])).toBeNull()
		})
	})
})
