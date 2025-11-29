#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import pkg from '../package.json'
import { runAdd, runAddInteractive } from './commands/add.ts'
import { runInit } from './commands/init.ts'
import { runStatus } from './commands/status.ts'

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
				message: {
					type: 'string',
					description: 'Changelog message',
					alias: 'm',
				},
			},
			run: async ({ args }) => {
				// If no args provided, run interactive mode
				if (!args.release && !args.alpha && !args.beta && !args.rc) {
					await runAddInteractive()
					return
				}

				// Resolve prerelease from flags
				let prerelease = args.prerelease as string | undefined
				if (args.alpha) prerelease = 'alpha'
				if (args.beta) prerelease = 'beta'
				if (args.rc) prerelease = 'rc'

				// Parse packages (support multiple -p flags)
				const packages = args.package ? [args.package as string] : undefined

				await runAdd({
					release: (args.release as string) || 'patch',
					prerelease,
					packages,
					message: args.message as string | undefined,
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
	},
	run: async () => {
		// Default: show status
		await runStatus()
	},
})

runMain(bump)
