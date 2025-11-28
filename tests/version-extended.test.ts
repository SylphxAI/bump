import { describe, expect, it } from 'bun:test'
import {
	adjustReleaseTypeForZeroVersion,
	calculateBumps,
	calculateMonorepoBumps,
	calculateSingleBump,
	incrementVersion,
} from '../src/core/version.ts'
import type { BumpConfig, ConventionalCommit, PackageInfo } from '../src/types.ts'

describe('version (extended)', () => {
	const defaultConfig: BumpConfig = {
		conventional: {
			types: {
				feat: 'minor',
				fix: 'patch',
				docs: null,
			},
		},
	}

	const createCommit = (overrides: Partial<ConventionalCommit> = {}): ConventionalCommit => ({
		hash: 'abc123',
		type: 'feat',
		subject: 'test',
		breaking: false,
		graduate: false,
		raw: 'feat: test',
		files: [],
		...overrides,
	})

	describe('adjustReleaseTypeForZeroVersion', () => {
		it('should convert major to minor for 0.x versions', () => {
			expect(adjustReleaseTypeForZeroVersion('0.1.0', 'major')).toBe('minor')
		})

		it('should convert minor to patch for 0.x versions', () => {
			expect(adjustReleaseTypeForZeroVersion('0.1.0', 'minor')).toBe('patch')
		})

		it('should not adjust patch for 0.x versions', () => {
			expect(adjustReleaseTypeForZeroVersion('0.1.0', 'patch')).toBe('patch')
		})

		it('should not adjust for 1.x+ versions', () => {
			expect(adjustReleaseTypeForZeroVersion('1.0.0', 'major')).toBe('major')
			expect(adjustReleaseTypeForZeroVersion('1.0.0', 'minor')).toBe('minor')
			expect(adjustReleaseTypeForZeroVersion('2.5.0', 'major')).toBe('major')
		})
	})

	describe('incrementVersion (extended)', () => {
		it('should throw for invalid version increment', () => {
			expect(() => incrementVersion('invalid', 'patch')).toThrow()
		})

		it('should handle premajor', () => {
			expect(incrementVersion('1.0.0', 'premajor', 'alpha')).toBe('2.0.0-alpha.0')
		})

		it('should handle preminor', () => {
			expect(incrementVersion('1.0.0', 'preminor', 'beta')).toBe('1.1.0-beta.0')
		})

		it('should handle prepatch', () => {
			expect(incrementVersion('1.0.0', 'prepatch', 'rc')).toBe('1.0.1-rc.0')
		})

		it('should handle prerelease on existing prerelease', () => {
			expect(incrementVersion('1.0.0-alpha.0', 'prerelease', 'alpha')).toBe('1.0.0-alpha.1')
		})

		it('should apply 0.x rules before incrementing', () => {
			// major on 0.x becomes minor
			expect(incrementVersion('0.5.0', 'major')).toBe('0.6.0')
			// minor on 0.x becomes patch
			expect(incrementVersion('0.5.0', 'minor')).toBe('0.5.1')
		})
	})

	describe('calculateSingleBump', () => {
		it('should return null when no release-triggering commits', () => {
			const pkg: PackageInfo = { name: 'test', version: '1.0.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'docs' })]

			const result = calculateSingleBump(pkg, commits, defaultConfig)

			expect(result).toBe(null)
		})

		it('should calculate minor bump for feat', () => {
			const pkg: PackageInfo = { name: 'test', version: '1.0.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'feat' })]

			const result = calculateSingleBump(pkg, commits, defaultConfig)

			expect(result?.newVersion).toBe('1.1.0')
			expect(result?.releaseType).toBe('minor')
		})

		it('should calculate patch bump for fix', () => {
			const pkg: PackageInfo = { name: 'test', version: '1.0.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'fix' })]

			const result = calculateSingleBump(pkg, commits, defaultConfig)

			expect(result?.newVersion).toBe('1.0.1')
			expect(result?.releaseType).toBe('patch')
		})

		it('should handle prerelease from config', () => {
			const pkg: PackageInfo = { name: 'test', version: '1.0.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'feat' })]

			const result = calculateSingleBump(pkg, commits, { ...defaultConfig, prerelease: 'beta' })

			expect(result?.newVersion).toBe('1.1.0-beta.0')
		})

		it('should handle prerelease from options', () => {
			const pkg: PackageInfo = { name: 'test', version: '1.0.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'feat' })]

			const result = calculateSingleBump(pkg, commits, defaultConfig, { preid: 'alpha' })

			expect(result?.newVersion).toBe('1.1.0-alpha.0')
		})

		it('should graduate from 0.x to 1.0.0 with config', () => {
			const pkg: PackageInfo = { name: 'test', version: '0.5.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'feat' })]

			const result = calculateSingleBump(pkg, commits, { ...defaultConfig, graduate: true })

			expect(result?.newVersion).toBe('1.0.0')
			expect(result?.releaseType).toBe('major')
		})

		it('should not graduate if already 1.x+', () => {
			const pkg: PackageInfo = { name: 'test', version: '1.5.0', path: '/test', private: false }
			const commits = [createCommit({ type: 'feat' })]

			const result = calculateSingleBump(pkg, commits, { ...defaultConfig, graduate: true })

			expect(result?.newVersion).toBe('1.6.0')
		})
	})

	describe('calculateBumps', () => {
		it('should calculate bumps for independent versioning', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/foo', version: '1.0.0', path: '/foo', private: false },
				{ name: '@scope/bar', version: '2.0.0', path: '/bar', private: false },
			]
			const commits = [createCommit({ type: 'feat', files: ['/foo/src/index.ts'] })]

			const bumps = calculateBumps(packages, commits, defaultConfig, { gitRoot: '' })

			expect(bumps.length).toBe(1)
			expect(bumps[0]?.package).toBe('@scope/foo')
		})

		it('should skip private packages', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/foo', version: '1.0.0', path: '/foo', private: true },
			]
			const commits = [createCommit({ type: 'feat', files: ['/foo/src/index.ts'] })]

			const bumps = calculateBumps(packages, commits, defaultConfig)

			expect(bumps.length).toBe(0)
		})

		it('should handle fixed versioning strategy', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/foo', version: '1.0.0', path: '/foo', private: false },
				{ name: '@scope/bar', version: '1.0.0', path: '/bar', private: false },
			]
			const commits = [createCommit({ type: 'feat' })]

			const bumps = calculateBumps(packages, commits, { ...defaultConfig, versioning: 'fixed' })

			expect(bumps.length).toBe(2)
			expect(bumps[0]?.newVersion).toBe('1.1.0')
			expect(bumps[1]?.newVersion).toBe('1.1.0')
		})

		it('should handle synced versioning strategy', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/foo', version: '1.0.0', path: '/foo', private: false },
				{ name: '@scope/bar', version: '1.2.0', path: '/bar', private: false },
			]
			const commits = [createCommit({ type: 'feat' })]

			const bumps = calculateBumps(packages, commits, { ...defaultConfig, versioning: 'synced' })

			// Should use highest version (1.2.0) and bump all to same new version
			expect(bumps.length).toBe(2)
			expect(bumps[0]?.newVersion).toBe('1.3.0')
			expect(bumps[1]?.newVersion).toBe('1.3.0')
		})

		it('should return empty array when no commits', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/foo', version: '1.0.0', path: '/foo', private: false },
			]

			const bumps = calculateBumps(packages, [], defaultConfig)

			expect(bumps.length).toBe(0)
		})

		it('should return empty array when no release-triggering commits for fixed strategy', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/foo', version: '1.0.0', path: '/foo', private: false },
			]
			const commits = [createCommit({ type: 'docs' })]

			const bumps = calculateBumps(packages, commits, { ...defaultConfig, versioning: 'fixed' })

			expect(bumps.length).toBe(0)
		})
	})

	describe('calculateMonorepoBumps', () => {
		it('should calculate bumps from per-package contexts', () => {
			const contexts = [
				{
					package: {
						name: '@scope/foo',
						version: '1.0.0',
						path: 'packages/foo',
						private: false,
					} as PackageInfo,
					commits: [createCommit({ type: 'feat', files: ['packages/foo/src/index.ts'] })],
					latestTag: '@scope/foo@1.0.0',
				},
			]

			const bumps = calculateMonorepoBumps(contexts, defaultConfig, { gitRoot: '' })

			expect(bumps.length).toBe(1)
			expect(bumps[0]?.package).toBe('@scope/foo')
			expect(bumps[0]?.newVersion).toBe('1.1.0')
		})

		it('should skip private packages', () => {
			const contexts = [
				{
					package: {
						name: '@scope/foo',
						version: '1.0.0',
						path: '/foo',
						private: true,
					} as PackageInfo,
					commits: [createCommit({ type: 'feat' })],
					latestTag: null,
				},
			]

			const bumps = calculateMonorepoBumps(contexts, defaultConfig)

			expect(bumps.length).toBe(0)
		})

		it('should handle prerelease from config', () => {
			const contexts = [
				{
					package: {
						name: '@scope/foo',
						version: '1.0.0',
						path: 'packages/foo',
						private: false,
					} as PackageInfo,
					commits: [createCommit({ type: 'feat', files: ['packages/foo/src/index.ts'] })],
					latestTag: null,
				},
			]

			const bumps = calculateMonorepoBumps(
				contexts,
				{ ...defaultConfig, prerelease: 'alpha' },
				{ gitRoot: '' }
			)

			expect(bumps[0]?.newVersion).toBe('1.1.0-alpha.0')
		})

		it('should graduate from 0.x to 1.0.0', () => {
			const contexts = [
				{
					package: {
						name: '@scope/foo',
						version: '0.9.0',
						path: 'packages/foo',
						private: false,
					} as PackageInfo,
					commits: [createCommit({ type: 'feat', files: ['packages/foo/src/index.ts'] })],
					latestTag: null,
				},
			]

			const bumps = calculateMonorepoBumps(
				contexts,
				{ ...defaultConfig, graduate: true },
				{ gitRoot: '' }
			)

			expect(bumps[0]?.newVersion).toBe('1.0.0')
			expect(bumps[0]?.releaseType).toBe('major')
		})

		it('should not create bump when no release-triggering commits', () => {
			const contexts = [
				{
					package: {
						name: '@scope/foo',
						version: '1.0.0',
						path: 'packages/foo',
						private: false,
					} as PackageInfo,
					commits: [createCommit({ type: 'docs', files: ['packages/foo/README.md'] })],
					latestTag: null,
				},
			]

			const bumps = calculateMonorepoBumps(contexts, defaultConfig, { gitRoot: '' })

			expect(bumps.length).toBe(0)
		})
	})
})
