#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import consola from 'consola'
import pkg from '../package.json'
import { runBump } from './commands/bump.ts'
import { runInit } from './commands/init.ts'
import { runPr } from './commands/pr.ts'
import { runPublish } from './commands/publish.ts'
import { runStatus } from './commands/status.ts'
import { BumpError, formatError } from './utils/errors.ts'

const bump = defineCommand({
	meta: {
		name: 'bump',
		version: pkg.version,
		description: pkg.description,
	},
	args: {
		'dry-run': {
			type: 'boolean',
			description: 'Preview changes without applying them',
			alias: 'd',
		},
		verbose: {
			type: 'boolean',
			description: 'Enable verbose/debug output',
			alias: 'v',
		},
		'no-tag': {
			type: 'boolean',
			description: 'Skip creating git tags',
		},
		'no-commit': {
			type: 'boolean',
			description: 'Skip creating git commits',
		},
		'no-changelog': {
			type: 'boolean',
			description: 'Skip updating changelog',
		},
		'no-release': {
			type: 'boolean',
			description: 'Skip creating GitHub release',
		},
		preid: {
			type: 'string',
			description: '[DEPRECATED] Use .bump/*.md with prerelease field instead',
		},
		prerelease: {
			type: 'boolean',
			description: '[DEPRECATED] Use .bump/*.md with prerelease field instead',
		},
		alpha: {
			type: 'boolean',
			description: '[DEPRECATED] Use .bump/*.md with prerelease: alpha instead',
		},
		beta: {
			type: 'boolean',
			description: '[DEPRECATED] Use .bump/*.md with prerelease: beta instead',
		},
		rc: {
			type: 'boolean',
			description: '[DEPRECATED] Use .bump/*.md with prerelease: rc instead',
		},
		graduate: {
			type: 'boolean',
			description: 'Graduate from 0.x to 1.0.0 (stable release)',
		},
	},
	subCommands: {
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
		pr: defineCommand({
			meta: {
				name: 'pr',
				description: 'Create or update a release PR',
			},
			args: {
				'dry-run': {
					type: 'boolean',
					description: 'Preview without creating PR',
					alias: 'd',
				},
				base: {
					type: 'string',
					description: 'Base branch for PR',
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
				description: 'Publish packages from .bump-pending.json (runs after PR merge)',
			},
			args: {
				'dry-run': {
					type: 'boolean',
					description: 'Preview without publishing',
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
	run: async ({ args, rawArgs }) => {
		// Don't run if a subcommand was invoked
		const subcommands = ['init', 'status', 'pr', 'publish']
		if (rawArgs.some((arg) => subcommands.includes(arg))) {
			return
		}

		// Enable verbose logging
		if (args.verbose) {
			consola.level = 4 // debug level
		}

		// Resolve preid from shorthand flags (deprecated)
		const prereleaseFlags = [args.alpha, args.beta, args.rc].filter(Boolean).length
		if (prereleaseFlags > 1) {
			consola.error('Cannot specify multiple pre-release flags (--alpha, --beta, --rc)')
			process.exit(1)
		}
		if (prereleaseFlags > 0 && args.preid) {
			consola.error('Cannot use both --preid and pre-release shorthand flags')
			process.exit(1)
		}

		let preid = args.preid as string | undefined
		if (args.alpha) preid = 'alpha'
		if (args.beta) preid = 'beta'
		if (args.rc) preid = 'rc'

		// Show deprecation warning for prerelease CLI flags
		if (preid || args.prerelease) {
			consola.warn('Prerelease CLI flags are deprecated.')
			consola.info('Use bump files instead: .bump/*.md with `prerelease: beta`')
		}

		try {
			await runBump({
				dryRun: args['dry-run'],
				tag: !args['no-tag'],
				commit: !args['no-commit'],
				changelog: !args['no-changelog'],
				release: !args['no-release'],
				preid,
				prerelease: args.prerelease || !!preid,
				verbose: args.verbose,
			})
		} catch (error) {
			if (error instanceof BumpError) {
				consola.error(formatError(error))
			} else {
				consola.error(error instanceof Error ? error.message : 'Unknown error')
			}
			process.exit(1)
		}
	},
})

runMain(bump)
