import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, getDefaultConfig, defineConfig } from '../src/core/config.ts'

const TEST_DIR = '/tmp/bump-config-test'

describe('config', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
		mkdirSync(TEST_DIR, { recursive: true })
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('getDefaultConfig', () => {
		it('should return default config', () => {
			const config = getDefaultConfig()

			expect(config.versioning).toBe('independent')
			expect(config.conventional?.types?.feat).toBe('minor')
			expect(config.conventional?.types?.fix).toBe('patch')
			expect(config.conventional?.types?.docs).toBe(null)
			expect(config.changelog?.file).toBe('CHANGELOG.md')
			expect(config.publish?.access).toBe('public')
			expect(config.baseBranch).toBe('main')
		})

		it('should return a new object each time', () => {
			const config1 = getDefaultConfig()
			const config2 = getDefaultConfig()

			expect(config1).not.toBe(config2)
		})
	})

	describe('defineConfig', () => {
		it('should return the config as-is', () => {
			const config = { baseBranch: 'develop' }
			const result = defineConfig(config)

			expect(result).toBe(config)
		})
	})

	describe('loadConfig', () => {
		it('should return default config when no config file exists', async () => {
			const config = await loadConfig(TEST_DIR)

			expect(config.versioning).toBe('independent')
			expect(config.conventional?.types?.feat).toBe('minor')
		})

		it('should load JSON config file', async () => {
			writeFileSync(
				join(TEST_DIR, 'bump.config.json'),
				JSON.stringify({ baseBranch: 'develop', graduate: true })
			)

			const config = await loadConfig(TEST_DIR)

			expect(config.baseBranch).toBe('develop')
			expect(config.graduate).toBe(true)
			// Should merge with defaults
			expect(config.versioning).toBe('independent')
		})

		it('should load .bumprc file', async () => {
			writeFileSync(
				join(TEST_DIR, '.bumprc'),
				JSON.stringify({ prerelease: 'alpha' })
			)

			const config = await loadConfig(TEST_DIR)

			expect(config.prerelease).toBe('alpha')
		})

		it('should load .bumprc.json file', async () => {
			writeFileSync(
				join(TEST_DIR, '.bumprc.json'),
				JSON.stringify({ prerelease: 'beta' })
			)

			const config = await loadConfig(TEST_DIR)

			expect(config.prerelease).toBe('beta')
		})

		it('should handle invalid JSON gracefully', async () => {
			writeFileSync(join(TEST_DIR, 'bump.config.json'), '{ invalid json }')

			const config = await loadConfig(TEST_DIR)

			// Should return default config
			expect(config.versioning).toBe('independent')
		})

		it('should prefer earlier config files in priority order', async () => {
			// bump.config.json should take priority over .bumprc
			writeFileSync(
				join(TEST_DIR, 'bump.config.json'),
				JSON.stringify({ baseBranch: 'from-json' })
			)
			writeFileSync(
				join(TEST_DIR, '.bumprc'),
				JSON.stringify({ baseBranch: 'from-bumprc' })
			)

			const config = await loadConfig(TEST_DIR)

			expect(config.baseBranch).toBe('from-json')
		})

		it('should merge user config with defaults deeply', async () => {
			writeFileSync(
				join(TEST_DIR, 'bump.config.json'),
				JSON.stringify({
					conventional: {
						types: {
							improvement: 'minor', // Add new type
						},
					},
				})
			)

			const config = await loadConfig(TEST_DIR)

			// New type should be added
			expect(config.conventional?.types?.improvement).toBe('minor')
			// Default types should still exist
			expect(config.conventional?.types?.feat).toBe('minor')
			expect(config.conventional?.types?.fix).toBe('patch')
		})

		it('should allow overriding default type mappings', async () => {
			writeFileSync(
				join(TEST_DIR, 'bump.config.json'),
				JSON.stringify({
					conventional: {
						types: {
							feat: 'patch', // Override default
						},
					},
				})
			)

			const config = await loadConfig(TEST_DIR)

			expect(config.conventional?.types?.feat).toBe('patch')
		})
	})
})
