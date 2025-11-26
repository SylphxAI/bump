import { join } from 'node:path'
import consola from 'consola'
import pc from 'picocolors'
import type { BumpConfig } from '../types.ts'
import { fileExists, writeFile } from '../utils/fs.ts'

const CONFIG_TEMPLATE = `import { defineConfig } from '@sylphx/bump'

export default defineConfig({
	// Version strategy: 'independent' | 'fixed' | 'synced'
	versioning: 'independent',

	// Conventional commits configuration
	conventional: {
		preset: 'conventional',
		// Customize which commit types trigger version bumps
		// types: {
		// 	feat: 'minor',
		// 	fix: 'patch',
		// 	perf: 'patch',
		// 	refactor: 'patch',
		// 	revert: 'patch',
		// 	// null means no version bump
		// 	docs: null,
		// 	style: null,
		// 	test: null,
		// 	build: null,
		// 	ci: null,
		// 	chore: null,
		// },
	},

	// Changelog configuration
	changelog: {
		format: 'github',
		includeCommits: true,
		groupBy: 'type',
		file: 'CHANGELOG.md',
	},

	// GitHub releases
	github: {
		release: true,
		draft: false,
	},

	// npm publishing
	publish: {
		access: 'public',
		tag: 'latest',
	},
})
`

const CONFIG_JSON_TEMPLATE: BumpConfig = {
	versioning: 'independent',
	conventional: {
		preset: 'conventional',
	},
	changelog: {
		format: 'github',
		includeCommits: true,
		groupBy: 'type',
		file: 'CHANGELOG.md',
	},
	github: {
		release: true,
		draft: false,
	},
	publish: {
		access: 'public',
		tag: 'latest',
	},
}

export interface InitOptions {
	cwd?: string
	format?: 'ts' | 'json'
	force?: boolean
}

export async function runInit(options: InitOptions = {}): Promise<void> {
	const cwd = options.cwd ?? process.cwd()
	const format = options.format ?? 'ts'

	const configFile = format === 'ts' ? 'bump.config.ts' : 'bump.config.json'
	const configPath = join(cwd, configFile)

	if (fileExists(configPath) && !options.force) {
		consola.warn(`${pc.cyan(configFile)} already exists. Use ${pc.dim('--force')} to overwrite.`)
		return
	}

	const content =
		format === 'ts' ? CONFIG_TEMPLATE : JSON.stringify(CONFIG_JSON_TEMPLATE, null, '\t')

	writeFile(configPath, content)
	consola.success(`Created ${pc.cyan(configFile)}`)

	consola.info(`
${pc.bold('Next steps:')}
  1. Customize your config in ${pc.cyan(configFile)}
  2. Use conventional commits for your changes
  3. Run ${pc.cyan('bump')} to create a release

${pc.dim('Conventional commit format:')}
  ${pc.green('feat')}: new feature (minor version)
  ${pc.yellow('fix')}: bug fix (patch version)
  ${pc.red('feat!')} or ${pc.red('BREAKING CHANGE')}: breaking change (major version)
`)
}
