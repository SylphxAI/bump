#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import consola from 'consola'
import { runBump } from './commands/bump.ts'
import { runInit } from './commands/init.ts'
import { runPr } from './commands/pr.ts'
import { runStatus } from './commands/status.ts'

const bump = defineCommand({
	meta: {
		name: 'bump',
		version: '0.0.1',
		description: 'Modern changelog and release management for Bun',
	},
	args: {
		'dry-run': {
			type: 'boolean',
			description: 'Preview changes without applying them',
			alias: 'd',
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
	},
	run: async ({ args }) => {
		try {
			await runBump({
				dryRun: args['dry-run'],
				tag: !args['no-tag'],
				commit: !args['no-commit'],
				changelog: !args['no-changelog'],
				release: !args['no-release'],
			})
		} catch (error) {
			consola.error(error instanceof Error ? error.message : 'Unknown error')
			process.exit(1)
		}
	},
})

runMain(bump)
