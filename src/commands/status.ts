import consola from 'consola'
import pc from 'picocolors'
import {
	calculateBumpsFromInfos,
	calculateSingleBumpFromInfo,
	discoverPackages,
	getPackageReleaseInfos,
	getSinglePackage,
	getSinglePackageReleaseInfo,
	groupCommitsByType,
	isMonorepo,
	loadConfig,
} from '../core/exports.ts'
import { getCurrentBranch, getGitRoot, isWorkingTreeClean } from '../utils/git.ts'

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

		// Use shared function to get release info for all packages
		const packageInfos = await getPackageReleaseInfos(packages)
		let totalCommits = 0

		for (const { pkg, npmVersion, baselineTag, commits } of packageInfos) {
			console.log(`  ${pc.cyan(pkg.name)}`)
			const baseline = npmVersion ? `npm@${npmVersion}` : (baselineTag ?? 'none')
			console.log(
				`    ${pc.dim('Published:')} ${npmVersion ? pc.green(npmVersion) : pc.dim('not published')}`
			)
			console.log(`    ${pc.dim('Baseline:')} ${baseline}`)
			console.log(`    ${pc.dim('Commits:')} ${pc.bold(commits.length)}`)

			if (commits.length > 0) {
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

		const packagesWithCommits = packageInfos.filter((p) => p.commits.length > 0)
		if (packagesWithCommits.length === 0) {
			consola.info('No unreleased commits in any package')
			return
		}

		console.log(`  ${pc.dim('Total unreleased commits:')} ${pc.bold(totalCommits)}`)
		console.log()

		// Use shared function to calculate bumps
		const { bumps } = calculateBumpsFromInfos(packageInfos, config, gitRoot)
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

		// Use shared function to get release info
		const info = await getSinglePackageReleaseInfo(pkg)
		const { npmVersion, baselineTag, commits } = info

		const baseline = npmVersion ? `npm@${npmVersion}` : (baselineTag ?? 'none')
		console.log(
			`  ${pc.dim('Published:')} ${npmVersion ? pc.green(npmVersion) : pc.dim('not published')}`
		)
		console.log(`  ${pc.dim('Baseline:')} ${baseline}`)
		console.log()

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

		// Use shared function to calculate bump
		const bump = calculateSingleBumpFromInfo(info, config)
		if (bump) {
			console.log(`${pc.bold('Planned version bump:')}\n`)
			console.log(
				`  ${pc.cyan(bump.package)}: ${pc.dim(bump.currentVersion)} → ${pc.green(bump.newVersion)} (${bump.releaseType})`
			)
		}
	}
}
