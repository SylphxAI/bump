import { describe, expect, it } from 'bun:test'
import { calculateBumpsFromInfos, type PackageReleaseInfo } from '../src/core/release.ts'
import type { BumpConfig, ConventionalCommit, PackageInfo } from '../src/types.ts'

describe('release', () => {
	describe('calculateBumpsFromInfos', () => {
		const mockCommit: ConventionalCommit = {
			hash: 'abc123',
			type: 'feat',
			subject: 'add feature',
			breaking: false,
			graduate: false,
			raw: 'feat: add feature',
			files: [],
		}

		const config: BumpConfig = {
			conventional: {
				types: {
					feat: 'minor',
					fix: 'patch',
				},
			},
		}

		it('should skip private packages in first release calculation', () => {
			const packageInfos: PackageReleaseInfo[] = [
				{
					pkg: {
						name: 'public-pkg',
						version: '1.0.0',
						path: '/packages/public',
						private: false,
					},
					npmVersion: null, // First release
					baselineTag: null,
					commits: [mockCommit],
				},
				{
					pkg: {
						name: 'private-example',
						version: '1.0.0',
						path: '/examples/private',
						private: true, // Should be skipped
					},
					npmVersion: null, // Would be first release
					baselineTag: null,
					commits: [mockCommit],
				},
			]

			const result = calculateBumpsFromInfos(packageInfos, config, '/repo')

			// Should only include public package
			expect(result.bumps.length).toBe(1)
			expect(result.bumps[0]?.package).toBe('public-pkg')
			expect(result.firstReleases.length).toBe(1)
			expect(result.firstReleases[0]?.package).toBe('public-pkg')
		})

		it('should skip private packages in version bump calculation', () => {
			const packageInfos: PackageReleaseInfo[] = [
				{
					pkg: {
						name: 'public-pkg',
						version: '1.0.0',
						path: '/packages/public',
						private: false,
					},
					npmVersion: '1.0.0', // Already published
					baselineTag: 'public-pkg@1.0.0',
					commits: [mockCommit],
				},
				{
					pkg: {
						name: 'private-example',
						version: '1.0.0',
						path: '/examples/private',
						private: true, // Should be skipped
					},
					npmVersion: '1.0.0', // Even if it shows as published
					baselineTag: 'private-example@1.0.0',
					commits: [mockCommit],
				},
			]

			const result = calculateBumpsFromInfos(packageInfos, config, '/repo')

			// Should only include public package
			expect(result.bumps.length).toBe(1)
			expect(result.bumps[0]?.package).toBe('public-pkg')
		})

		it('should return empty bumps when all packages are private', () => {
			const packageInfos: PackageReleaseInfo[] = [
				{
					pkg: {
						name: 'private-example-1',
						version: '1.0.0',
						path: '/examples/1',
						private: true,
					},
					npmVersion: null,
					baselineTag: null,
					commits: [mockCommit],
				},
				{
					pkg: {
						name: 'private-example-2',
						version: '1.0.0',
						path: '/examples/2',
						private: true,
					},
					npmVersion: null,
					baselineTag: null,
					commits: [mockCommit],
				},
			]

			const result = calculateBumpsFromInfos(packageInfos, config, '/repo')

			expect(result.bumps.length).toBe(0)
			expect(result.firstReleases.length).toBe(0)
		})

		it('should skip packages with no commits', () => {
			const packageInfos: PackageReleaseInfo[] = [
				{
					pkg: {
						name: 'pkg-with-commits',
						version: '1.0.0',
						path: '/packages/with-commits',
						private: false,
					},
					npmVersion: null,
					baselineTag: null,
					commits: [mockCommit],
				},
				{
					pkg: {
						name: 'pkg-no-commits',
						version: '1.0.0',
						path: '/packages/no-commits',
						private: false,
					},
					npmVersion: null,
					baselineTag: null,
					commits: [], // No commits
				},
			]

			const result = calculateBumpsFromInfos(packageInfos, config, '/repo')

			expect(result.bumps.length).toBe(1)
			expect(result.bumps[0]?.package).toBe('pkg-with-commits')
		})
	})
})
