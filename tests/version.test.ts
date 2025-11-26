import { describe, expect, it } from 'bun:test'
import {
	compareVersions,
	formatVersionTag,
	getHighestVersion,
	incrementVersion,
	isValidVersion,
	parseVersionFromTag,
} from '../src/core/version.ts'

describe('version', () => {
	describe('incrementVersion', () => {
		it('should increment patch version', () => {
			expect(incrementVersion('1.0.0', 'patch')).toBe('1.0.1')
			expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
		})

		it('should increment minor version', () => {
			expect(incrementVersion('1.0.0', 'minor')).toBe('1.1.0')
			expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
		})

		it('should increment major version', () => {
			expect(incrementVersion('1.0.0', 'major')).toBe('2.0.0')
			expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
		})

		it('should handle prerelease versions', () => {
			expect(incrementVersion('1.0.0', 'prerelease', 'alpha')).toBe('1.0.1-alpha.0')
			expect(incrementVersion('1.0.0-alpha.0', 'prerelease', 'alpha')).toBe('1.0.0-alpha.1')
		})
	})

	describe('isValidVersion', () => {
		it('should return true for valid versions', () => {
			expect(isValidVersion('1.0.0')).toBe(true)
			expect(isValidVersion('0.0.1')).toBe(true)
			expect(isValidVersion('1.0.0-alpha.1')).toBe(true)
		})

		it('should return false for invalid versions', () => {
			expect(isValidVersion('invalid')).toBe(false)
			expect(isValidVersion('1.0')).toBe(false)
			// Note: semver.valid coerces 'v1.0.0' to '1.0.0', so it's considered valid
		})
	})

	describe('compareVersions', () => {
		it('should compare versions correctly', () => {
			expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
			expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
			expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
			expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
		})
	})

	describe('getHighestVersion', () => {
		it('should return highest version', () => {
			expect(getHighestVersion(['1.0.0', '1.0.1', '0.9.0'])).toBe('1.0.1')
			expect(getHighestVersion(['0.1.0', '0.2.0', '0.1.5'])).toBe('0.2.0')
		})

		it('should return null for empty array', () => {
			expect(getHighestVersion([])).toBe(null)
		})

		it('should filter out invalid versions', () => {
			expect(getHighestVersion(['1.0.0', 'invalid', '0.9.0'])).toBe('1.0.0')
		})
	})

	describe('formatVersionTag', () => {
		it('should format version with prefix', () => {
			expect(formatVersionTag('1.0.0')).toBe('v1.0.0')
			expect(formatVersionTag('1.0.0', '')).toBe('1.0.0')
			expect(formatVersionTag('1.0.0', 'release-')).toBe('release-1.0.0')
		})
	})

	describe('parseVersionFromTag', () => {
		it('should parse version from tag', () => {
			expect(parseVersionFromTag('v1.0.0')).toBe('1.0.0')
			expect(parseVersionFromTag('1.0.0', '')).toBe('1.0.0')
			expect(parseVersionFromTag('release-1.0.0', 'release-')).toBe('1.0.0')
		})

		it('should return null for invalid tags', () => {
			expect(parseVersionFromTag('invalid')).toBe(null)
			expect(parseVersionFromTag('v-invalid')).toBe(null)
		})
	})
})
