import consola from 'consola'
import pc from 'picocolors'
import { createReleasesForBumps } from '../adapters/github.ts'
import {
	type MonorepoBumpContext,
	calculateMonorepoBumps,
	calculateSingleBump,
	createInitialBump,
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
} from '../core/exports.ts'
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

/** Type for commits returned by getConventionalCommits */
type ConventionalCommit = Awaited<ReturnType<typeof getConventionalCommits>>[number]

/** Return type for package analysis */
interface PackageAnalysisResult {
	bumps: VersionBump[]
	allCommits: ConventionalCommit[]
}

/**
 * Analyze monorepo packages and calculate bumps
 */
async function analyzeMonorepoPackages(
	packages: Awaited<ReturnType<typeof discoverPackages>>,
	config: Awaited<ReturnType<typeof loadConfig>>,
	gitRoot: string,
	options: Pick<BumpOptions, 'preid' | 'prerelease'>
): Promise<PackageAnalysisResult> {
	consola.info(`Monorepo detected with ${pc.bold(packages.length)} packages`)

	// Pre-fetch all tags once for reuse
	const allTags = await getAllTags()

	// Process all packages in parallel - LOCAL version is SSOT
	const packageResults = await Promise.all(
		packages.map(async (pkg) => {
			const npmVersion = await getNpmPublishedVersion(pkg.name)
			let baselineTag: string | null = findTagForVersion(pkg.version, allTags, pkg.name)
			if (!baselineTag) {
				baselineTag = await getLatestTagForPackage(pkg.name, allTags)
			}
			const commits = await getConventionalCommits(baselineTag ?? undefined)
			return { pkg, baselineTag, npmVersion, commits }
		})
	)

	// Build contexts from parallel results
	const contexts: MonorepoBumpContext[] = []
	const firstReleases: VersionBump[] = []
	const alreadyBumped: VersionBump[] = []
	const allCommits: ConventionalCommit[] = []

	for (const { pkg, baselineTag, npmVersion, commits } of packageResults) {
		// Collect all commits for reporting
		for (const c of commits) {
			if (!allCommits.some((ac) => ac.hash === c.hash)) {
				allCommits.push(c)
			}
		}

		const baseline = baselineTag ?? 'no previous release'
		consola.info(`  ${pc.cyan(pkg.name)}: ${commits.length} commits since ${baseline}`)

		// First release
		if (!npmVersion) {
			if (commits.length === 0) continue
			const bump = createInitialBump(pkg, commits)
			consola.info(`  ${pc.dim('→')} First release: ${bump.newVersion}`)
			firstReleases.push(bump)
			continue
		}

		// Local > npm: already bumped, just publish
		const semver = await import('semver')
		if (semver.default.gt(pkg.version, npmVersion)) {
			consola.info(`  ${pc.dim('→')} Already bumped: ${npmVersion} → ${pkg.version}`)
			alreadyBumped.push({
				package: pkg.name,
				currentVersion: npmVersion,
				newVersion: pkg.version,
				releaseType: 'manual',
				commits,
			})
			continue
		}

		// Local < npm: something is wrong, skip
		if (semver.default.lt(pkg.version, npmVersion)) {
			consola.warn(`  ${pc.dim('→')} Skipping: local ${pkg.version} < npm ${npmVersion}`)
			continue
		}

		// Local == npm: need new commits to bump
		if (commits.length === 0) continue

		contexts.push({
			package: pkg,
			commits,
			latestTag: baselineTag,
		})
	}

	// Combine all bumps
	const bumps = [
		...firstReleases,
		...alreadyBumped,
		...calculateMonorepoBumps(contexts, config, {
			gitRoot,
			preid: options.preid,
			prerelease: options.prerelease,
		}),
	]

	return { bumps, allCommits }
}

/**
 * Analyze single package and calculate bump
 */
async function analyzeSinglePackage(
	cwd: string,
	config: Awaited<ReturnType<typeof loadConfig>>,
	options: Pick<BumpOptions, 'preid' | 'prerelease' | 'verbose'>
): Promise<PackageAnalysisResult & { pkg: ReturnType<typeof getSinglePackage> }> {
	const pkg = getSinglePackage(cwd)
	if (!pkg) {
		return { bumps: [], allCommits: [], pkg: null }
	}

	const npmVersion = await getNpmPublishedVersion(pkg.name)
	const allTags = await getAllTags()
	let baselineTag: string | null = findTagForVersion(pkg.version, allTags)
	if (!baselineTag) {
		baselineTag = await getLatestTag()
	}

	const commits = await getConventionalCommits(baselineTag ?? undefined)
	const baseline = baselineTag ?? 'beginning'
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

	let bumps: VersionBump[] = []

	// First release
	if (!npmVersion) {
		if (commits.length > 0) {
			const bump = createInitialBump(pkg, commits)
			consola.info(`First release: ${pkg.name}@${bump.newVersion}`)
			bumps = [bump]
		}
		return { bumps, allCommits: commits, pkg }
	}

	// Compare versions
	const semver = await import('semver')
	if (semver.default.gt(pkg.version, npmVersion)) {
		// Local > npm: already bumped
		consola.info(`Already bumped: ${npmVersion} → ${pkg.version}`)
		bumps = [
			{
				package: pkg.name,
				currentVersion: npmVersion,
				newVersion: pkg.version,
				releaseType: 'manual',
				commits,
			},
		]
	} else if (semver.default.lt(pkg.version, npmVersion)) {
		// Local < npm: something is wrong
		consola.warn(`Skipping: local ${pkg.version} < npm ${npmVersion}`)
	} else if (commits.length > 0) {
		// Local == npm: need new commits to bump
		const bump = calculateSingleBump(pkg, commits, config, {
			preid: options.preid,
			prerelease: options.prerelease,
		})
		if (bump) bumps = [bump]
	}

	return { bumps, allCommits: commits, pkg }
}

/**
 * Apply version changes to packages
 */
function applyVersionChanges(
	bumps: VersionBump[],
	packages: Awaited<ReturnType<typeof discoverPackages>>,
	config: Awaited<ReturnType<typeof loadConfig>>,
	cwd: string,
	repoUrl: string | null,
	updateChangelogs: boolean
): string[] {
	const filesToStage: string[] = []

	for (const bump of bumps) {
		const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
		consola.start(`Updating ${pc.cyan(bump.package)} to ${pc.green(bump.newVersion)}...`)
		updatePackageVersion(pkgPath, bump.newVersion)
		filesToStage.push(`${pkgPath}/package.json`)

		if (updateChangelogs) {
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

	return filesToStage
}

/**
 * Commit and tag release
 */
async function commitAndTagRelease(
	bumps: VersionBump[],
	packages: Awaited<ReturnType<typeof discoverPackages>>,
	filesToStage: string[],
	options: Pick<BumpOptions, 'commit' | 'tag'>
): Promise<void> {
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
		const tagPromises = bumps.map((bump) => {
			const tag = formatVersionTag(bump.newVersion)
			const tagName = packages.length > 1 ? `${bump.package}@${bump.newVersion}` : tag
			return createTag(tagName, `Release ${tagName}`)
		})
		consola.start(`Creating tag${bumps.length > 1 ? 's' : ''}...`)
		await Promise.all(tagPromises)
	}
}

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

	// Analyze packages and calculate bumps
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []
	let result: PackageAnalysisResult

	if (packages.length > 0) {
		result = await analyzeMonorepoPackages(packages, config, gitRoot, options)
	} else {
		const singleResult = await analyzeSinglePackage(cwd, config, options)
		if (!singleResult.pkg) {
			consola.error('No package.json found')
			return { config, packages: [], commits: [], bumps: [], dryRun: options.dryRun ?? false }
		}
		result = singleResult
	}

	const { bumps, allCommits } = result

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

	// Apply version changes
	const filesToStage = applyVersionChanges(
		bumps,
		packages,
		config,
		cwd,
		repoUrl,
		options.changelog !== false
	)

	// Commit and tag
	await commitAndTagRelease(bumps, packages, filesToStage, options)

	// Create GitHub releases
	if (options.release !== false) {
		consola.start(`Creating GitHub release${bumps.length > 1 ? 's' : ''}...`)
		await createReleasesForBumps(bumps, config)
	}

	consola.success('Release completed!')

	return { config, packages, commits: allCommits, bumps, dryRun: false }
}
