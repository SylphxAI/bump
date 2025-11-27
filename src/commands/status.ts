import consola from 'consola'
import pc from 'picocolors'
import {
	type MonorepoBumpContext,
	calculateMonorepoBumps,
	calculateSingleBump,
	discoverPackages,
	getConventionalCommits,
	getSinglePackage,
	groupCommitsByType,
	isMonorepo,
	loadConfig,
} from '../core/index.ts'
import {
	findTagForVersion,
	getAllTags,
	getCurrentBranch,
	getGitRoot,
	getLatestTag,
	getLatestTagForPackage,
	isWorkingTreeClean,
} from '../utils/git.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'

export interface StatusOptions {
	cwd?: string
}

export async function runStatus(options: StatusOptions = {}): Promise<void> {
	const cwd = options.cwd ?? process.cwd()
	const config = await loadConfig(cwd)
	const gitRoot = await getGitRoot()

	consola.info(`${pc.bold('Current Status')}\n`)

	// Git info
	const branch = await getCurrentBranch()
	const clean = await isWorkingTreeClean()

	console.log(`  ${pc.dim('Branch:')} ${pc.cyan(branch)}`)
	console.log(`  ${pc.dim('Clean:')} ${clean ? pc.green('yes') : pc.yellow('no')}`)
	console.log()

	// Calculate potential bumps
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	if (packages.length > 0) {
		// Monorepo mode - show per-package status
		console.log(`${pc.bold('Package Status:')}\n`)

		const contexts: MonorepoBumpContext[] = []
		let totalCommits = 0

		// Pre-fetch all tags once
		const allTags = await getAllTags()

		for (const pkg of packages) {
			// Query npm for the latest published version (source of truth)
			const npmVersion = await getNpmPublishedVersion(pkg.name)

			// Find the git tag corresponding to that npm version
			let baselineTag: string | null = null
			if (npmVersion) {
				baselineTag = findTagForVersion(npmVersion, allTags, pkg.name)
			}

			// Fall back to latest git tag if npm version not found or tag missing
			if (!baselineTag) {
				baselineTag = await getLatestTagForPackage(pkg.name, allTags)
			}

			const commits = await getConventionalCommits(baselineTag ?? undefined)

			console.log(`  ${pc.cyan(pkg.name)}`)
			const baseline = npmVersion ? `npm@${npmVersion}` : (baselineTag ?? 'none')
			console.log(
				`    ${pc.dim('Published:')} ${npmVersion ? pc.green(npmVersion) : pc.dim('not published')}`
			)
			console.log(`    ${pc.dim('Baseline:')} ${baseline}`)
			console.log(`    ${pc.dim('Commits:')} ${pc.bold(commits.length)}`)

			if (commits.length > 0) {
				contexts.push({
					package: pkg,
					commits,
					latestTag: baselineTag,
				})
				totalCommits += commits.length

				// Show commit types
				const groups = groupCommitsByType(commits)
				const typeSummary = Array.from(groups.entries())
					.map(([type, c]) => `${type}: ${c.length}`)
					.join(', ')
				console.log(`    ${pc.dim('Types:')} ${typeSummary}`)

				// Breaking changes
				const breaking = commits.filter((c) => c.breaking)
				if (breaking.length > 0) {
					console.log(`    ${pc.red('Breaking:')} ${breaking.length}`)
				}
			}
			console.log()
		}

		if (contexts.length === 0) {
			consola.info('No unreleased commits in any package')
			return
		}

		console.log(`  ${pc.dim('Total unreleased commits:')} ${pc.bold(totalCommits)}`)
		console.log()

		const bumps = calculateMonorepoBumps(contexts, config, { gitRoot })
		if (bumps.length > 0) {
			console.log(`${pc.bold('Planned version bumps:')}\n`)
			for (const bump of bumps) {
				console.log(
					`  ${pc.cyan(bump.package)}: ${pc.dim(bump.currentVersion)} → ${pc.green(bump.newVersion)} (${bump.releaseType})`
				)
			}
		} else {
			consola.info('No version bumps needed')
		}
	} else {
		// Single package mode - use npm published version as baseline
		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return
		}

		// Query npm for the latest published version (source of truth)
		const npmVersion = await getNpmPublishedVersion(pkg.name)
		const allTags = await getAllTags()

		// Find the git tag corresponding to that npm version
		let baselineTag: string | null = null
		if (npmVersion) {
			baselineTag = findTagForVersion(npmVersion, allTags)
		}

		// Fall back to latest git tag if npm version not found or tag missing
		if (!baselineTag) {
			baselineTag = await getLatestTag()
		}

		const baseline = npmVersion ? `npm@${npmVersion}` : (baselineTag ?? 'none')
		console.log(
			`  ${pc.dim('Published:')} ${npmVersion ? pc.green(npmVersion) : pc.dim('not published')}`
		)
		console.log(`  ${pc.dim('Baseline:')} ${baseline}`)
		console.log()

		const commits = await getConventionalCommits(baselineTag ?? undefined)

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

		const bump = calculateSingleBump(pkg, commits, config)
		if (bump) {
			console.log(`${pc.bold('Planned version bump:')}\n`)
			console.log(
				`  ${pc.cyan(bump.package)}: ${pc.dim(bump.currentVersion)} → ${pc.green(bump.newVersion)} (${bump.releaseType})`
			)
		}
	}
}
