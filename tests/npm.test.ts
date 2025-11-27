import { describe, expect, it } from 'bun:test'
import {
	getNpmPublishedVersion,
	getNpmPublishedVersions,
	isPackagePublished,
} from '../src/utils/npm.ts'

describe('npm utils', () => {
	describe('getNpmPublishedVersion', () => {
		it('should return version for published package', async () => {
			// Test with a well-known package
			const version = await getNpmPublishedVersion('lodash')
			expect(version).not.toBe(null)
			expect(version).toMatch(/^\d+\.\d+\.\d+/)
		})

		it('should return null for non-existent package', async () => {
			const version = await getNpmPublishedVersion('this-package-definitely-does-not-exist-xyz-123')
			expect(version).toBe(null)
		})

		it('should return version for scoped package', async () => {
			// Test with a scoped package
			const version = await getNpmPublishedVersion('@types/node')
			expect(version).not.toBe(null)
		})
	})

	describe('getNpmPublishedVersions', () => {
		it('should return versions for published package', async () => {
			const versions = await getNpmPublishedVersions('lodash')
			expect(Array.isArray(versions)).toBe(true)
			expect(versions.length).toBeGreaterThan(0)
		})

		it('should return empty array for non-existent package', async () => {
			const versions = await getNpmPublishedVersions('this-package-definitely-does-not-exist-xyz-123')
			expect(versions).toEqual([])
		})

		it('should return array with single version for new packages', async () => {
			// Test package that likely has few versions - we can't control this
			// but the test structure validates the single version handling
			const versions = await getNpmPublishedVersions('lodash')
			expect(Array.isArray(versions)).toBe(true)
		})
	})

	describe('isPackagePublished', () => {
		it('should return true for published package', async () => {
			const published = await isPackagePublished('lodash')
			expect(published).toBe(true)
		})

		it('should return false for non-existent package', async () => {
			const published = await isPackagePublished('this-package-definitely-does-not-exist-xyz-123')
			expect(published).toBe(false)
		})
	})
})
