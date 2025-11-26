import { join } from 'node:path'
import { defu } from 'defu'
import type { BumpConfig } from '../types.ts'
import { fileExists, readFile } from '../utils/fs.ts'

const CONFIG_FILES = [
	'bump.config.ts',
	'bump.config.js',
	'bump.config.json',
	'.bumprc',
	'.bumprc.json',
]

const DEFAULT_CONFIG: BumpConfig = {
	versioning: 'independent',
	conventional: {
		preset: 'conventional',
		types: {
			feat: 'minor',
			fix: 'patch',
			docs: null,
			style: null,
			refactor: 'patch',
			perf: 'patch',
			test: null,
			build: null,
			ci: null,
			chore: null,
			revert: 'patch',
		},
	},
	changelog: {
		format: 'github',
		includeCommits: true,
		groupBy: 'type',
		file: 'CHANGELOG.md',
	},
	publish: {
		access: 'public',
		tag: 'latest',
	},
	github: {
		release: true,
		draft: false,
	},
	packages: {
		include: ['packages/*'],
		exclude: [],
		dependencyUpdates: 'auto',
	},
	baseBranch: 'main',
}

/**
 * Load config from file
 */
export async function loadConfig(cwd: string): Promise<BumpConfig> {
	for (const configFile of CONFIG_FILES) {
		const configPath = join(cwd, configFile)
		if (!fileExists(configPath)) continue

		if (configFile.endsWith('.ts') || configFile.endsWith('.js')) {
			// Dynamic import for JS/TS configs
			try {
				const module = await import(configPath)
				const userConfig = module.default ?? module
				return defu(userConfig, DEFAULT_CONFIG)
			} catch {
				// Config file failed to load, try next
			}
		}

		if (configFile.endsWith('.json') || configFile.startsWith('.bumprc')) {
			// JSON config
			const content = readFile(configPath)
			if (content) {
				try {
					const userConfig = JSON.parse(content)
					return defu(userConfig, DEFAULT_CONFIG)
				} catch {
					// Config file failed to parse, try next
				}
			}
		}
	}

	return DEFAULT_CONFIG
}

/**
 * Get default config
 */
export function getDefaultConfig(): BumpConfig {
	return { ...DEFAULT_CONFIG }
}

/**
 * Define config helper for TypeScript support
 */
export function defineConfig(config: BumpConfig): BumpConfig {
	return config
}
