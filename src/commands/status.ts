import consola from 'consola'
import pc from 'picocolors'
import {
	calculateBumps,
	calculateSingleBump,
	discoverPackages,
	getConventionalCommits,
	getSinglePackage,
	groupCommitsByType,
	isMonorepo,
	loadConfig,
} from '../core/index.ts'
import { getCurrentBranch, getLatestTag, isWorkingTreeClean } from '../utils/git.ts'

export interface StatusOptions {
	cwd?: string
}

export async function runStatus(options: StatusOptions = {}): Promise<void> {
	const cwd = options.cwd ?? process.cwd()
	const config = await loadConfig(cwd)

	consola.info(`${pc.bold('Current Status')}\n`)

	// Git info
	const branch = await getCurrentBranch()
	const clean = await isWorkingTreeClean()
	const latestTag = await getLatestTag()

	console.log(`  ${pc.dim('Branch:')} ${pc.cyan(branch)}`)
	console.log(`  ${pc.dim('Clean:')} ${clean ? pc.green('yes') : pc.yellow('no')}`)
	console.log(`  ${pc.dim('Latest tag:')} ${latestTag ? pc.cyan(latestTag) : pc.dim('none')}`)
	console.log()

	// Get commits
	const commits = await getConventionalCommits(latestTag ?? undefined)

	if (commits.length === 0) {
		consola.info('No unreleased commits')
		return
	}

	console.log(`  ${pc.dim('Unreleased commits:')} ${pc.bold(commits.length)}`)
	console.log()

	// Group by type
	const groups = groupCommitsByType(commits)
	for (const [type, typeCommits] of groups) {
		console.log(`  ${pc.cyan(type)}: ${typeCommits.length}`)
	}
	console.log()

	// Breaking changes
	const breaking = commits.filter((c) => c.breaking)
	if (breaking.length > 0) {
		console.log(`  ${pc.red('Breaking changes:')} ${breaking.length}`)
		console.log()
	}

	// Calculate potential bumps
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	if (packages.length > 0) {
		const bumps = calculateBumps(packages, commits, config)
		if (bumps.length > 0) {
			console.log(`${pc.bold('Planned version bumps:')}\n`)
			for (const bump of bumps) {
				console.log(
					`  ${pc.cyan(bump.package)}: ${pc.dim(bump.currentVersion)} → ${pc.green(bump.newVersion)} (${bump.releaseType})`
				)
			}
		}
	} else {
		const pkg = getSinglePackage(cwd)
		if (pkg) {
			const bump = calculateSingleBump(pkg, commits, config)
			if (bump) {
				console.log(`${pc.bold('Planned version bump:')}\n`)
				console.log(
					`  ${pc.cyan(bump.package)}: ${pc.dim(bump.currentVersion)} → ${pc.green(bump.newVersion)} (${bump.releaseType})`
				)
			}
		}
	}
}
