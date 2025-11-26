import consola from 'consola'
import pc from 'picocolors'
import { createReleasesForBumps } from '../adapters/github.ts'
import {
	calculateMonorepoBumps,
	calculateSingleBump,
	discoverPackages,
	formatVersionTag,
	generateChangelogEntry,
	getConventionalCommits,
	getSinglePackage,
	isMonorepo,
	loadConfig,
	type MonorepoBumpContext,
	updateChangelog,
	updateDependencyVersions,
	updatePackageVersion,
} from '../core/index.ts'
import type { ReleaseContext, VersionBump } from '../types.ts'
import {
	commit,
	createTag,
	getAllTags,
	getGitHubRepoUrl,
	getGitRoot,
	getLatestTag,
	getLatestTagForPackage,
	isWorkingTreeClean,
	stageFiles,
} from '../utils/git.ts'

export interface BumpOptions {
	cwd?: string
	dryRun?: boolean
	tag?: boolean
	commit?: boolean
	changelog?: boolean
	push?: boolean
	release?: boolean
	/** Pre-release identifier (alpha, beta, rc) */
	preid?: string
	/** Create a pre-release version */
	prerelease?: boolean
	/** Enable verbose/debug output */
	verbose?: boolean
}

export async function runBump(options: BumpOptions = {}): Promise<ReleaseContext> {
	const cwd = options.cwd ?? process.cwd()
	const config = await loadConfig(cwd)
	const gitRoot = await getGitRoot()

	if (options.verbose) {
		consola.debug('Options:', JSON.stringify(options, null, 2))
		consola.debug('Config:', JSON.stringify(config, null, 2))
		consola.debug('Git root:', gitRoot)
		consola.debug('Working directory:', cwd)
	}

	consola.start('Analyzing commits...')

	// Determine packages and bumps
	let bumps: VersionBump[] = []
	let allCommits: ReturnType<typeof getConventionalCommits> extends Promise<infer T> ? T : never =
		[]
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	if (packages.length > 0) {
		consola.info(`Monorepo detected with ${pc.bold(packages.length)} packages`)

		// Pre-fetch all tags once for reuse
		const allTags = await getAllTags()

		// Process all packages in parallel - get tags and commits concurrently
		const packageResults = await Promise.all(
			packages.map(async (pkg) => {
				const latestTag = await getLatestTagForPackage(pkg.name, allTags)
				const commits = await getConventionalCommits(latestTag ?? undefined)
				return { pkg, latestTag, commits }
			})
		)

		// Build contexts from parallel results
		const contexts: MonorepoBumpContext[] = []
		for (const { pkg, latestTag, commits } of packageResults) {
			if (commits.length > 0) {
				contexts.push({
					package: pkg,
					commits,
					latestTag,
				})
				// Collect all commits for reporting
				for (const c of commits) {
					if (!allCommits.some((ac) => ac.hash === c.hash)) {
						allCommits.push(c)
					}
				}
			}

			if (latestTag) {
				consola.info(`  ${pc.cyan(pkg.name)}: ${commits.length} commits since ${latestTag}`)
			} else {
				consola.info(`  ${pc.cyan(pkg.name)}: ${commits.length} commits (no previous release)`)
			}
		}

		if (contexts.length === 0) {
			consola.info('No new commits since last releases')
			return {
				config,
				packages,
				commits: [],
				bumps: [],
				dryRun: options.dryRun ?? false,
			}
		}

		bumps = calculateMonorepoBumps(contexts, config, { gitRoot, preid: options.preid, prerelease: options.prerelease })
	} else {
		// Single package mode
		const latestTag = await getLatestTag()
		const commits = await getConventionalCommits(latestTag ?? undefined)
		allCommits = commits

		if (commits.length === 0) {
			consola.info('No new commits since last release')
			return {
				config,
				packages: [],
				commits: [],
				bumps: [],
				dryRun: options.dryRun ?? false,
			}
		}

		consola.info(`Found ${pc.bold(commits.length)} commits since ${latestTag ?? 'beginning'}`)

		if (options.verbose) {
			consola.debug('Commits:')
			for (const c of commits) {
				consola.debug(`  ${c.hash.slice(0, 7)} ${c.type}${c.scope ? `(${c.scope})` : ''}: ${c.subject}${c.breaking ? ' [BREAKING]' : ''}`)
			}
		}

		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return { config, packages: [], commits, bumps: [], dryRun: options.dryRun ?? false }
		}

		if (options.verbose) {
			consola.debug(`Package: ${pkg.name}@${pkg.version}`)
		}

		const bump = calculateSingleBump(pkg, commits, config, { preid: options.preid, prerelease: options.prerelease })
		if (bump) bumps = [bump]
	}

	if (bumps.length === 0) {
		consola.info('No version bumps needed (commits do not trigger version changes)')
		return { config, packages, commits: allCommits, bumps, dryRun: options.dryRun ?? false }
	}

	// Display planned changes
	consola.box(
		bumps
			.map(
				(b) =>
					`${pc.cyan(b.package)}: ${pc.dim(b.currentVersion)} → ${pc.green(b.newVersion)} (${b.releaseType})`
			)
			.join('\n')
	)

	if (options.dryRun) {
		consola.info('Dry run mode - no changes will be made')
		return { config, packages, commits: allCommits, bumps, dryRun: true }
	}

	// Check working tree
	if (options.commit !== false && !(await isWorkingTreeClean())) {
		consola.warn('Working tree is not clean. Please commit or stash changes first.')
	}

	// Apply changes
	const filesToStage: string[] = []
	const repoUrl = await getGitHubRepoUrl()

	for (const bump of bumps) {
		const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd

		// Update package version
		consola.start(`Updating ${pc.cyan(bump.package)} to ${pc.green(bump.newVersion)}...`)
		updatePackageVersion(pkgPath, bump.newVersion)
		filesToStage.push(`${pkgPath}/package.json`)

		// Update changelog
		if (options.changelog !== false) {
			const entry = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
			updateChangelog(pkgPath, entry, config)
			filesToStage.push(`${pkgPath}/${config.changelog?.file ?? 'CHANGELOG.md'}`)
		}
	}

	// Update dependency versions in monorepo
	if (packages.length > 0 && config.packages?.dependencyUpdates !== 'none') {
		const versionUpdates = new Map(bumps.map((b) => [b.package, b.newVersion]))
		updateDependencyVersions(cwd, packages, versionUpdates)
	}

	// Commit changes
	if (options.commit !== false) {
		consola.start('Committing changes...')
		await stageFiles(filesToStage)

		const commitMsg =
			bumps.length === 1
				? `chore(release): ${bumps[0]?.package}@${bumps[0]?.newVersion}`
				: `chore(release): bump versions\n\n${bumps.map((b) => `- ${b.package}@${b.newVersion}`).join('\n')}`

		await commit(commitMsg)
	}

	// Create tags
	if (options.tag !== false) {
		for (const bump of bumps) {
			const tag = formatVersionTag(bump.newVersion)
			const tagName = packages.length > 1 ? `${bump.package}@${bump.newVersion}` : tag
			consola.start(`Creating tag ${pc.cyan(tagName)}...`)
			await createTag(tagName, `Release ${tagName}`)
		}
	}

	// Create GitHub releases (in parallel)
	if (options.release !== false) {
		consola.start(`Creating GitHub release${bumps.length > 1 ? 's' : ''}...`)
		await createReleasesForBumps(bumps, config)
	}

	consola.success('Release completed!')

	return { config, packages, commits: allCommits, bumps, dryRun: false }
}
