import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import consola from 'consola'
import { $ } from 'zx'

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
	restoreWorkspaceDeps,
	saveWorkspaceDeps,
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
import { detectPM, getInstallCommand, getInstallCommandCI } from '../utils/pm.ts'

export interface PublishOptions {
	cwd?: string
	dryRun?: boolean
}

export interface PublishResult {
	published: boolean
	packages: Array<{ name: string; version: string }>
}

/**
 * Check if the current commit is already a release commit
 * This happens when a release PR was just merged
 */
async function isReleaseCommit(): Promise<boolean> {
	const result = await $`git log -1 --format=%s`.nothrow()
	if (result.exitCode !== 0) return false
	const message = result.stdout.trim()
	return message.startsWith('chore(release):')
}

/**
 * Parse package versions from existing release commit message
 * Returns map of package name -> version
 *
 * Supported formats:
 * - Single: "chore(release): @scope/pkg@1.0.0"
 * - Comma-separated: "chore(release): @scope/pkg1@1.0.0, @scope/pkg2@2.0.0"
 * - Bullet list: "chore(release): 2 packages\n\n- @scope/pkg1@1.0.0\n- @scope/pkg2@2.0.0"
 */
function parseReleaseCommitVersions(message: string): Map<string, string> {
	const versions = new Map<string, string>()

	// Try to match all @package@version patterns in the first line
	const firstLine = message.split('\n')[0]
	const inlineMatches = firstLine.matchAll(/(@?[\w@\/-]+)@(\d+\.\d+\.\d+)/g)
	for (const match of inlineMatches) {
		versions.set(match[1], match[2])
	}

	// Also check for bullet list format in the body
	const bulletMatches = message.matchAll(/^- (@?[\w@\/-]+)@(\d+\.\d+\.\d+)/gm)
	for (const match of bulletMatches) {
		versions.set(match[1], match[2])
	}

	return versions
}

/**
 * Publish packages - recalculates bumps fresh from npm baseline
 * This runs after PR merge - calculates version changes, publishes, then commits
 */
export async function runPublish(options: PublishOptions = {}): Promise<PublishResult> {
	const cwd = options.cwd ?? process.cwd()

	// Check if we're on a release commit (PR was just merged)
	// In this case, skip version bumping - just publish what's there
	const onReleaseCommit = await isReleaseCommit()
	if (onReleaseCommit) {
		return runPublishFromReleaseCommit(cwd, options)
	}

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

		// Build contexts from parallel results, handling first releases
		const contexts: MonorepoBumpContext[] = []
		const firstReleases: VersionBump[] = []

		for (const { pkg, baselineTag, npmVersion, commits } of packageResults) {
			if (commits.length === 0) continue

			// First release: use package.json version directly
			if (!npmVersion) {
				consola.info(`First release: ${pkg.name}@${pkg.version}`)
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
			consola.info('No new commits since last releases - nothing to publish')
			return { published: false, packages: [] }
		}

		// Combine first releases with calculated bumps
		bumps = [...firstReleases, ...calculateMonorepoBumps(contexts, config, { gitRoot })]

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
			// Use npm version as current version (source of truth)
			const pkgWithNpmVersion = { ...pkg, version: npmVersion }
			const bump = calculateSingleBump(pkgWithNpmVersion, commits, config)
			if (bump) bumps = [bump]
		}
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
		return {
			published: false,
			packages: bumps.map((b) => ({ name: b.package, version: b.newVersion })),
		}
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
	// Save original workspace deps first so we can restore after publish
	let workspaceDepsSnapshot: ReturnType<typeof saveWorkspaceDeps> | null = null
	if (packages.length > 0) {
		// Re-read packages to get updated versions after Step 1
		const updatedPackages = await discoverPackages(cwd, config)
		workspaceDepsSnapshot = saveWorkspaceDeps(cwd, updatedPackages)
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

	// Create temporary .npmrc for authentication at git root (npm ignores workspace .npmrc files)
	const npmrcPath = join(cwd, '.npmrc')
	const existingNpmrc = existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf-8') : null
	if (process.env.NPM_TOKEN) {
		writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`)
	}

	for (const bump of bumps) {
		const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd

		consola.info(`  Publishing ${pc.cyan(bump.package)}@${pc.green(bump.newVersion)}...`)

		// Use npm publish (universal across all package managers)
		const publishResult = await $({ cwd: pkgPath })`npm publish --access public`.nothrow()

		if (publishResult.exitCode !== 0) {
			consola.error(`  Failed to publish ${bump.package}: ${publishResult.stderr}`)
			allSuccess = false
			// Don't continue - we want atomic publish
			break
		}

		publishedPackages.push({ name: bump.package, version: bump.newVersion, path: pkgPath })
	}

	// Restore original .npmrc or remove temporary one
	if (process.env.NPM_TOKEN) {
		if (existingNpmrc !== null) {
			writeFileSync(npmrcPath, existingNpmrc)
		} else {
			try {
				unlinkSync(npmrcPath)
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	if (!allSuccess) {
		consola.error('Publish failed - aborting without committing changes')
		consola.info('Fix the issue and re-run the workflow')
		process.exit(1)
	}

	// Step 3.5: Restore workspace:* deps before committing
	// This keeps workspace protocol in source while publishing resolved versions
	if (workspaceDepsSnapshot) {
		restoreWorkspaceDeps(workspaceDepsSnapshot)
		consola.info('  Restored workspace dependencies')
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

/**
 * Publish from an existing release commit (PR was already merged)
 * Skips version bumping and commit - just publishes, tags, and releases
 */
async function runPublishFromReleaseCommit(
	cwd: string,
	options: PublishOptions
): Promise<PublishResult> {
	consola.start('Publishing from release commit...')

	// Get the commit message to parse versions
	const commitResult = await $`git log -1 --format=%B`
	const commitMsg = commitResult.stdout.trim()
	const releaseVersions = parseReleaseCommitVersions(commitMsg)

	if (releaseVersions.size === 0) {
		consola.warn('Could not parse versions from release commit')
		return { published: false, packages: [] }
	}

	// Load config and packages
	const config = await loadConfig(cwd)
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	// Build list of packages to publish from the commit message
	const packagesToPublish: Array<{ name: string; version: string; path: string }> = []

	if (packages.length > 0) {
		// Monorepo: match packages from commit message
		for (const [name, version] of releaseVersions) {
			const pkg = packages.find((p) => p.name === name)
			if (pkg) {
				packagesToPublish.push({ name, version, path: pkg.path })
			}
		}
	} else {
		// Single package
		const pkg = await getSinglePackage(cwd)
		const version = pkg ? releaseVersions.get(pkg.name) : undefined
		if (pkg && version) {
			packagesToPublish.push({
				name: pkg.name,
				version,
				path: cwd,
			})
		}
	}

	if (packagesToPublish.length === 0) {
		consola.warn('No packages found to publish')
		return { published: false, packages: [] }
	}

	consola.info(`Found ${packagesToPublish.length} package(s) to publish:`)
	for (const pkg of packagesToPublish) {
		consola.info(`  ${pc.cyan(pkg.name)}@${pc.green(pkg.version)}`)
	}

	if (options.dryRun) {
		consola.info('Dry run - no changes will be made')
		return {
			published: false,
			packages: packagesToPublish.map((p) => ({ name: p.name, version: p.version })),
		}
	}

	// Resolve workspace deps for publish (temporary)
	let workspaceDepsSnapshot: ReturnType<typeof saveWorkspaceDeps> | null = null
	if (packages.length > 0) {
		workspaceDepsSnapshot = saveWorkspaceDeps(cwd, packages)
		resolveAllWorkspaceDeps(cwd, packages)
		consola.info('  Resolved workspace dependencies')
	}

	// Install dependencies
	consola.start('Installing dependencies...')
	const pm = detectPM(cwd)
	const ciCmd = getInstallCommandCI(pm)
	let installResult = await $`${ciCmd}`.nothrow()
	if (installResult.exitCode !== 0) {
		const cmd = getInstallCommand(pm)
		installResult = await $`${cmd}`.nothrow()
		if (installResult.exitCode !== 0) {
			consola.warn('Install had issues, continuing...')
		}
	}

	// Publish
	consola.start('Publishing to npm...')
	const publishedPackages: Array<{ name: string; version: string; path: string }> = []
	let allSuccess = true

	// Create .npmrc at git root
	const npmrcPath = join(cwd, '.npmrc')
	const existingNpmrc = existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf-8') : null
	if (process.env.NPM_TOKEN) {
		writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`)
	}

	for (const pkg of packagesToPublish) {
		// Check if this exact version is already published
		const npmVersion = await getNpmPublishedVersion(pkg.name)
		if (npmVersion === pkg.version) {
			consola.info(`  ${pc.cyan(pkg.name)}@${pc.green(pkg.version)} already published, skipping`)
			publishedPackages.push(pkg) // Still count as published for tags
			continue
		}

		consola.info(`  Publishing ${pc.cyan(pkg.name)}@${pc.green(pkg.version)}...`)
		const publishResult = await $({ cwd: pkg.path })`npm publish --access public`.nothrow()

		if (publishResult.exitCode !== 0) {
			consola.error(`  Failed to publish ${pkg.name}: ${publishResult.stderr}`)
			allSuccess = false
			break
		}

		publishedPackages.push(pkg)
	}

	// Restore .npmrc
	if (process.env.NPM_TOKEN) {
		if (existingNpmrc !== null) {
			writeFileSync(npmrcPath, existingNpmrc)
		} else {
			try {
				unlinkSync(npmrcPath)
			} catch {
				// Ignore
			}
		}
	}

	if (!allSuccess) {
		consola.error('Publish failed')
		process.exit(1)
	}

	// Restore workspace deps (no commit needed - PR already has everything)
	if (workspaceDepsSnapshot) {
		restoreWorkspaceDeps(workspaceDepsSnapshot)
		consola.info('  Restored workspace dependencies')
	}

	// Create tags
	consola.start('Creating tags...')
	for (const pkg of publishedPackages) {
		const tag = packages.length > 0 ? `${pkg.name}@${pkg.version}` : `v${pkg.version}`
		const existingTag = await $`git tag -l ${tag}`
		if (!existingTag.stdout.trim()) {
			await $`git tag -a ${tag} -m "Release ${tag}"`
		}
	}
	await $`git push --tags`

	// Create GitHub releases
	consola.start('Creating GitHub releases...')
	for (const pkg of publishedPackages) {
		const tag = packages.length > 0 ? `${pkg.name}@${pkg.version}` : `v${pkg.version}`
		const changelogFile = join(pkg.path, 'CHANGELOG.md')

		if (existsSync(changelogFile)) {
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
