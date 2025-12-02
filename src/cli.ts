#!/usr/bin/env node
import consola from 'consola'
import { defineCommand, runMain } from 'citty'
import pkg from '../package.json'
import { runAdd, runAddInteractive } from './commands/add.ts'
import { runInit } from './commands/init.ts'
import { runPr } from './commands/pr.ts'
import { runPublish } from './commands/publish.ts'
import { runStatus } from './commands/status.ts'
import { getGitRoot } from './utils/git.ts'

const bump = defineCommand({
	meta: {
		name: 'bump',
		version: pkg.version,
		description: pkg.description,
	},
	subCommands: {
		add: defineCommand({
			meta: {
				name: 'add',
				description: 'Create a bump file for the next release',
			},
			args: {
				release: {
					type: 'positional',
					description: 'Release type (patch, minor, major) or explicit version',
					required: false,
				},
				alpha: {
					type: 'boolean',
					description: 'Create alpha prerelease',
				},
				beta: {
					type: 'boolean',
					description: 'Create beta prerelease',
				},
				rc: {
					type: 'boolean',
					description: 'Create release candidate',
				},
				prerelease: {
					type: 'string',
					description: 'Prerelease identifier',
					alias: 'pre',
				},
				package: {
					type: 'string',
					description: 'Target package (can be used multiple times)',
					alias: 'p',
				},
				all: {
					type: 'boolean',
					description: 'Target all packages (monorepo only)',
					alias: 'a',
				},
				message: {
					type: 'string',
					description: 'Changelog message',
					alias: 'm',
				},
			},
			run: async ({ args }) => {
				// Always use git root as cwd (bump files must be at repo root)
				const cwd = await getGitRoot()

				// If no args provided (and no --all), run interactive mode
				if (!args.release && !args.alpha && !args.beta && !args.rc && !args.all) {
					await runAddInteractive({ cwd })
					return
				}

				// Resolve prerelease from flags
				let prerelease = args.prerelease as string | undefined
				if (args.alpha) prerelease = 'alpha'
				if (args.beta) prerelease = 'beta'
				if (args.rc) prerelease = 'rc'

				// Parse packages (support multiple -p flags and comma-separated values)
				let packages: string[] | undefined
				if (args.package) {
					const pkgArg = args.package
					// Handle array (multiple -p flags) or string (single -p or comma-separated)
					if (Array.isArray(pkgArg)) {
						packages = pkgArg.flatMap((p) => p.split(',').map((s) => s.trim()))
					} else {
						packages = (pkgArg as string).split(',').map((s) => s.trim())
					}
					packages = packages.filter(Boolean)
					if (packages.length === 0) packages = undefined
				}

				await runAdd({
					release: (args.release as string) || 'patch',
					prerelease,
					packages,
					message: args.message as string | undefined,
					cwd,
				})
			},
		}),
		init: defineCommand({
			meta: {
				name: 'init',
				description: 'Initialize bump configuration',
			},
			args: {
				format: {
					type: 'string',
					description: 'Config format: ts or json',
					default: 'ts',
				},
				force: {
					type: 'boolean',
					description: 'Overwrite existing config',
					alias: 'f',
				},
			},
			run: async ({ args }) => {
				await runInit({
					format: args.format as 'ts' | 'json',
					force: Boolean(args.force),
				})
			},
		}),
		status: defineCommand({
			meta: {
				name: 'status',
				description: 'Show release status and pending changes',
			},
			run: async () => {
				await runStatus()
			},
		}),
		// CI-only commands (not for local use)
		pr: defineCommand({
			meta: {
				name: 'pr',
				// No description = hidden from help
			},
			args: {
				'dry-run': {
					type: 'boolean',
					alias: 'd',
				},
				base: {
					type: 'string',
					default: 'main',
				},
			},
			run: async ({ args }) => {
				await runPr({
					dryRun: Boolean(args['dry-run']),
					baseBranch: args.base as string,
				})
			},
		}),
		publish: defineCommand({
			meta: {
				name: 'publish',
				// No description = hidden from help
			},
			args: {
				'dry-run': {
					type: 'boolean',
					alias: 'd',
				},
			},
			run: async ({ args }) => {
				const result = await runPublish({
					dryRun: Boolean(args['dry-run']),
				})
				// Output machine-readable result for CI
				if (result.packages.length > 0) {
					console.log(`::bump-result::${JSON.stringify(result)}`)
				}
				if (!result.published) {
					process.exit(0) // No packages to publish is not an error
				}
			},
		}),
	},
	run: async () => {
		// Default: show status
		await runStatus()
	},
})

runMain(bump)
