import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import consola from 'consola'
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
	updateChangelog,
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

/**
 * Update package.json version directly
 */
function updatePackageVersion(pkgPath: string, newVersion: string): void {
	const pkgJsonPath = join(pkgPath, 'package.json')
	const content = readFileSync(pkgJsonPath, 'utf-8')
	const pkg = JSON.parse(content) as Record<string, unknown>
	pkg.version = newVersion
	const { writeFileSync } = require('node:fs')
	writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, '\t')}\n`, 'utf-8')
}

export interface PublishOptions {
	cwd?: string
	dryRun?: boolean
}

/**
 * Publish packages - recalculates bumps fresh from npm baseline
 * This runs after PR merge - calculates version changes, publishes, then commits
 */
export async function runPublish(options: PublishOptions = {}): Promise<boolean> {
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
			return false
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
			return false
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
			return false
		}

		// Use npm version as current version (source of truth)
		const pkgWithNpmVersion = npmVersion ? { ...pkg, version: npmVersion } : pkg
		const bump = calculateSingleBump(pkgWithNpmVersion, commits, config)
		if (bump) bumps = [bump]
	}

	if (bumps.length === 0) {
		consola.info('No version bumps needed')
		return false
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
		return false
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

	// Step 2: Install dependencies (after version update so workspace:^ resolves correctly)
	consola.start('Installing dependencies...')
	const installResult = await $`bun install --frozen-lockfile 2>/dev/null || bun install`
		.quiet()
		.nothrow()
	if (installResult.exitCode !== 0) {
		consola.warn('Install had issues, continuing...')
	}

	// Step 3: Publish each package
	consola.start('Publishing to npm...')
	const publishedPackages: Array<{ name: string; version: string; path: string }> = []
	let allSuccess = true

	for (const bump of bumps) {
		const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd

		consola.info(`  Publishing ${pc.cyan(bump.package)}@${pc.green(bump.newVersion)}...`)

		const publishResult = await $`NPM_CONFIG_TOKEN=${process.env.NPM_TOKEN} bun publish --access public --cwd ${pkgPath}`
			.quiet()
			.nothrow()

		if (publishResult.exitCode !== 0) {
			consola.error(`  Failed to publish ${bump.package}: ${publishResult.stderr.toString()}`)
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
		const existingTag = await $`git tag -l ${tag}`.quiet().text()
		if (!existingTag.trim()) {
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
	return true
}
