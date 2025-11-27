import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'zx'
import consola from 'consola'

// Configure zx
$.quiet = true
import pc from 'picocolors'
import {
	type MonorepoBumpContext,
	calculateCascadeBumps,
	calculateMonorepoBumps,
	calculateSingleBump,
	discoverPackages,
	generateChangelogEntry,
	getConventionalCommits,
	getSinglePackage,
	incrementVersion,
	isMonorepo,
	loadConfig,
	resolveAllWorkspaceDeps,
	updateChangelog,
	updatePackageVersion,
} from '../core/index.ts'
import type { VersionBump } from '../types.ts'
import {
	findTagForVersion,
	getAllTags,
	getGitHubRepoUrl,
	getGitRoot,
	getLatestTag,
	getLatestTagForPackage,
} from '../utils/git.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'
import { detectPM, getInstallCommandCI, getInstallCommand } from '../utils/pm.ts'

export interface PublishOptions {
	cwd?: string
	dryRun?: boolean
}

export interface PublishResult {
	published: boolean
	packages: Array<{ name: string; version: string }>
}

/**
 * Publish packages - recalculates bumps fresh from npm baseline
 * This runs after PR merge - calculates version changes, publishes, then commits
 */
export async function runPublish(options: PublishOptions = {}): Promise<PublishResult> {
	const cwd = options.cwd ?? process.cwd()

	consola.start('Calculating version bumps from npm baseline...')

	// Load config and determine package structure
	const [config, gitRoot] = await Promise.all([loadConfig(cwd), getGitRoot()])
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	// Calculate bumps fresh (same logic as pr.ts)
	let bumps: VersionBump[] = []

	if (packages.length > 0) {
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

		// Build contexts from parallel results
		const contexts: MonorepoBumpContext[] = []
		for (const { pkg, baselineTag, commits } of packageResults) {
			if (commits.length > 0) {
				contexts.push({
					package: pkg,
					commits,
					latestTag: baselineTag,
				})
			}
		}

		if (contexts.length === 0) {
			consola.info('No new commits since last releases - nothing to publish')
			return { published: false, packages: [] }
		}

		bumps = calculateMonorepoBumps(contexts, config, { gitRoot })

		// Cascade bump: find packages that depend on bumped packages
		if (bumps.length > 0) {
			const bumpedVersions = new Map(bumps.map((b) => [b.package, b.newVersion]))
			const bumpedNames = new Set(bumpedVersions.keys())
			const cascadePackages = calculateCascadeBumps(packages, bumpedNames)

			for (const pkg of cascadePackages) {
				const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
				const updatedDeps: Array<{ name: string; version: string }> = []
				for (const [depName, newVersion] of bumpedVersions) {
					if (depName in allDeps) {
						updatedDeps.push({ name: depName, version: newVersion })
					}
				}

				const newVersion = incrementVersion(pkg.version, 'patch')
				bumps.push({
					package: pkg.name,
					currentVersion: pkg.version,
					newVersion,
					releaseType: 'patch',
					commits: [],
					updatedDeps,
				})
			}
		}
	} else {
		// Single package mode - use npm published version as baseline
		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return { published: false, packages: [] }
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

		if (commits.length === 0) {
			consola.info('No new commits since last release - nothing to publish')
			return { published: false, packages: [] }
		}

		// Use npm version as current version (source of truth)
		const pkgWithNpmVersion = npmVersion ? { ...pkg, version: npmVersion } : pkg
		const bump = calculateSingleBump(pkgWithNpmVersion, commits, config)
		if (bump) bumps = [bump]
	}

	if (bumps.length === 0) {
		consola.info('No version bumps needed')
		return { published: false, packages: [] }
	}

	consola.start(`Publishing ${bumps.length} package(s)...`)

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
		consola.info('Dry run - no changes will be made')
		return { published: false, packages: bumps.map((b) => ({ name: b.package, version: b.newVersion })) }
	}

	const repoUrl = await getGitHubRepoUrl()

	// Step 1: Apply version changes and update changelogs
	consola.start('Applying version changes...')
	for (const bump of bumps) {
		const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
		updatePackageVersion(pkgPath, bump.newVersion)

		// Update CHANGELOG.md
		const entry = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
		updateChangelog(pkgPath, entry, config)

		consola.info(`  ${pc.cyan(bump.package)} → ${pc.green(bump.newVersion)}`)
	}

	// Step 1.5: Resolve ALL workspace:* dependencies to actual versions
	// We handle this ourselves for full package manager compatibility (npm, yarn, pnpm, bun)
	if (packages.length > 0) {
		// Re-read packages to get updated versions after Step 1
		const updatedPackages = await discoverPackages(cwd, config)
		resolveAllWorkspaceDeps(cwd, updatedPackages)
		consola.info('  Resolved workspace dependencies')
	}

	// Step 2: Install dependencies (after version update so workspace:^ resolves correctly)
	consola.start('Installing dependencies...')
	const pm = detectPM(cwd)
	const ciCmd = getInstallCommandCI(pm)
	let installResult = await $`${ciCmd}`.nothrow()
	if (installResult.exitCode !== 0) {
		// Fall back to regular install
		const cmd = getInstallCommand(pm)
		installResult = await $`${cmd}`.nothrow()
		if (installResult.exitCode !== 0) {
			consola.warn('Install had issues, continuing...')
		}
	}

	// Step 3: Publish each package
	consola.start('Publishing to npm...')
	const publishedPackages: Array<{ name: string; version: string; path: string }> = []
	let allSuccess = true

	for (const bump of bumps) {
		const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd

		consola.info(`  Publishing ${pc.cyan(bump.package)}@${pc.green(bump.newVersion)}...`)

		// Use npm publish (universal across all package managers)
		const env = process.env.NPM_TOKEN ? { ...process.env, NPM_CONFIG_TOKEN: process.env.NPM_TOKEN } : process.env
		const publishResult = await $({ cwd: pkgPath, env })`npm publish --access public`.nothrow()

		if (publishResult.exitCode !== 0) {
			consola.error(`  Failed to publish ${bump.package}: ${publishResult.stderr}`)
			allSuccess = false
			// Don't continue - we want atomic publish
			break
		}

		publishedPackages.push({ name: bump.package, version: bump.newVersion, path: pkgPath })
	}

	if (!allSuccess) {
		consola.error('Publish failed - aborting without committing changes')
		consola.info('Fix the issue and re-run the workflow')
		process.exit(1)
	}

	// Step 4: Commit version changes (only after successful publish)
	consola.start('Committing changes...')
	await $`git add -A`

	const commitMsg =
		bumps.length === 1
			? `chore(release): ${bumps[0]?.package}@${bumps[0]?.newVersion}`
			: `chore(release): ${bumps.length} packages\n\n${bumps.map((b) => `- ${b.package}@${b.newVersion}`).join('\n')}`

	await $`git commit -m ${commitMsg}`
	await $`git push`

	// Step 5: Create tags
	consola.start('Creating tags...')
	for (const pkg of publishedPackages) {
		const tag = packages.length > 0 ? `${pkg.name}@${pkg.version}` : `v${pkg.version}`
		const existingTag = await $`git tag -l ${tag}`
		if (!existingTag.stdout.trim()) {
			await $`git tag -a ${tag} -m "Release ${tag}"`
		}
	}
	await $`git push --tags`

	// Step 6: Create GitHub releases
	consola.start('Creating GitHub releases...')
	for (const pkg of publishedPackages) {
		const tag = packages.length > 0 ? `${pkg.name}@${pkg.version}` : `v${pkg.version}`
		const changelogFile = join(pkg.path, 'CHANGELOG.md')

		if (existsSync(changelogFile)) {
			// Extract notes for this version from changelog
			const changelog = readFileSync(changelogFile, 'utf-8')
			const versionMatch = changelog.match(
				new RegExp(`## ${pkg.version.replace(/\./g, '\\.')}[^#]*`, 's')
			)
			const notes = versionMatch ? versionMatch[0].trim() : ''

			if (notes) {
				await $`echo ${notes} | gh release create ${tag} --title ${tag} --notes-file -`
					.quiet()
					.nothrow()
			} else {
				await $`gh release create ${tag} --title ${tag} --generate-notes`.quiet().nothrow()
			}
		} else {
			await $`gh release create ${tag} --title ${tag} --generate-notes`.quiet().nothrow()
		}
	}

	consola.success('Publish completed!')
	return {
		published: true,
		packages: publishedPackages.map((p) => ({ name: p.name, version: p.version })),
	}
}
