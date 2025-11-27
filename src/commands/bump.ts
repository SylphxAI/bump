import consola from 'consola'
import pc from 'picocolors'
import { createReleasesForBumps } from '../adapters/github.ts'
import {
	type MonorepoBumpContext,
	calculateMonorepoBumps,
	calculateSingleBump,
	discoverPackages,
	formatVersionTag,
	generateChangelogEntry,
	getConventionalCommits,
	getSinglePackage,
	isMonorepo,
	loadConfig,
	updateChangelog,
	updateDependencyVersions,
	updatePackageVersion,
} from '../core/index.ts'
import type { ReleaseContext, VersionBump } from '../types.ts'
import {
	commit,
	createTag,
	findTagForVersion,
	getAllTags,
	getGitHubRepoUrl,
	getGitRoot,
	getLatestTag,
	getLatestTagForPackage,
	isWorkingTreeClean,
	stageFiles,
} from '../utils/git.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'

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

	// Parallel initialization - load config and git info concurrently
	const [config, gitRoot] = await Promise.all([loadConfig(cwd), getGitRoot()])

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

		// Process all packages in parallel - use npm published version as baseline
		const packageResults = await Promise.all(
			packages.map(async (pkg) => {
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
				return { pkg, baselineTag, npmVersion, commits }
			})
		)

		// Build contexts from parallel results, handling first releases
		const contexts: MonorepoBumpContext[] = []
		const firstReleases: VersionBump[] = []

		for (const { pkg, baselineTag, npmVersion, commits } of packageResults) {
			if (commits.length === 0) continue

			// Collect all commits for reporting
			for (const c of commits) {
				if (!allCommits.some((ac) => ac.hash === c.hash)) {
					allCommits.push(c)
				}
			}

			const baseline = npmVersion ? `npm@${npmVersion}` : (baselineTag ?? 'no previous release')
			consola.info(`  ${pc.cyan(pkg.name)}: ${commits.length} commits since ${baseline}`)

			// First release: use package.json version directly
			if (!npmVersion) {
				consola.info(`  ${pc.dim('→')} First release: ${pkg.version}`)
				firstReleases.push({
					package: pkg.name,
					currentVersion: pkg.version,
					newVersion: pkg.version,
					releaseType: 'patch', // Initial release marker
					commits,
				})
			} else {
				// Already published: calculate bump from npm version
				contexts.push({
					package: pkg,
					commits,
					latestTag: baselineTag,
				})
			}
		}

		if (contexts.length === 0 && firstReleases.length === 0) {
			consola.info('No new commits since last releases')
			return {
				config,
				packages,
				commits: [],
				bumps: [],
				dryRun: options.dryRun ?? false,
			}
		}

		// Combine first releases with calculated bumps
		bumps = [
			...firstReleases,
			...calculateMonorepoBumps(contexts, config, {
				gitRoot,
				preid: options.preid,
				prerelease: options.prerelease,
			}),
		]
	} else {
		// Single package mode - use npm published version as baseline
		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return { config, packages: [], commits: [], bumps: [], dryRun: options.dryRun ?? false }
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

		const commits = await getConventionalCommits(baselineTag ?? undefined)
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

		const baseline = npmVersion ? `npm@${npmVersion}` : (baselineTag ?? 'beginning')
		consola.info(`Found ${pc.bold(commits.length)} commits since ${baseline}`)

		if (options.verbose) {
			consola.debug('Commits:')
			for (const c of commits) {
				consola.debug(
					`  ${c.hash.slice(0, 7)} ${c.type}${c.scope ? `(${c.scope})` : ''}: ${c.subject}${c.breaking ? ' [BREAKING]' : ''}`
				)
			}
			consola.debug(`Package: ${pkg.name}@${pkg.version}`)
		}

		// First release: use package.json version directly (developer's intent)
		// Already published: use npm version as baseline (source of truth)
		if (!npmVersion) {
			consola.info(`First release: ${pkg.name}@${pkg.version}`)
			bumps = [
				{
					package: pkg.name,
					currentVersion: pkg.version,
					newVersion: pkg.version,
					releaseType: 'patch', // Initial release marker
					commits,
				},
			]
		} else {
			const pkgWithNpmVersion = { ...pkg, version: npmVersion }
			const bump = calculateSingleBump(pkgWithNpmVersion, commits, config, {
				preid: options.preid,
				prerelease: options.prerelease,
			})
			if (bump) bumps = [bump]
		}
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

	// Pre-fetch repo URL and check working tree in parallel
	const [isClean, repoUrl] = await Promise.all([
		options.commit !== false ? isWorkingTreeClean() : Promise.resolve(true),
		getGitHubRepoUrl(),
	])

	if (options.commit !== false && !isClean) {
		consola.warn('Working tree is not clean. Please commit or stash changes first.')
	}

	// Apply changes
	const filesToStage: string[] = []

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

	// Create tags (in parallel)
	if (options.tag !== false) {
		const tagPromises = bumps.map((bump) => {
			const tag = formatVersionTag(bump.newVersion)
			const tagName = packages.length > 1 ? `${bump.package}@${bump.newVersion}` : tag
			return createTag(tagName, `Release ${tagName}`)
		})
		consola.start(`Creating tag${bumps.length > 1 ? 's' : ''}...`)
		await Promise.all(tagPromises)
	}

	// Create GitHub releases (in parallel)
	if (options.release !== false) {
		consola.start(`Creating GitHub release${bumps.length > 1 ? 's' : ''}...`)
		await createReleasesForBumps(bumps, config)
	}

	consola.success('Release completed!')

	return { config, packages, commits: allCommits, bumps, dryRun: false }
}
