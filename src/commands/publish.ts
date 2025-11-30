import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import consola from 'consola'
import { $ } from 'zx'

// Configure zx
$.quiet = true
import pc from 'picocolors'
import {
	calculateBumpsFromInfos,
	calculateCascadeBumps,
	calculateSingleBumpFromInfo,
	discoverPackages,
	generateChangelogEntry,
	getPackageReleaseInfos,
	getSinglePackage,
	getSinglePackageReleaseInfo,
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
import { getGitHubRepoUrl, getGitRoot } from '../utils/git.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'
import { detectPM, getInstallCommand, getInstallCommandCI, getRunCommand } from '../utils/pm.ts'

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

	// Calculate bumps using shared functions
	let bumps: VersionBump[] = []

	if (packages.length > 0) {
		// Use shared functions for monorepo release calculation
		const packageInfos = await getPackageReleaseInfos(packages)
		const { bumps: calculatedBumps, firstReleases } = calculateBumpsFromInfos(
			packageInfos,
			config,
			gitRoot
		)

		// Log first releases
		for (const release of firstReleases) {
			consola.info(`First release: ${release.package}@${release.newVersion}`)
		}

		if (calculatedBumps.length === 0) {
			consola.info('No new commits since last releases - nothing to publish')
			return { published: false, packages: [] }
		}

		bumps = calculatedBumps

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

				let newVersion: string
				try {
					newVersion = incrementVersion(pkg.version, 'patch')
				} catch (error) {
					consola.error(`Invalid version in cascade package ${pkg.name}: ${pkg.version}`)
					throw error
				}
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
		// Single package mode - use shared function
		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return { published: false, packages: [] }
		}

		const info = await getSinglePackageReleaseInfo(pkg)

		if (info.commits.length === 0) {
			consola.info('No new commits since last release - nothing to publish')
			return { published: false, packages: [] }
		}

		// First release: log and use package.json version
		if (!info.npmVersion) {
			consola.info(`First release: ${pkg.name}@${pkg.version}`)
			bumps = [
				{
					package: pkg.name,
					currentVersion: pkg.version,
					newVersion: pkg.version,
					releaseType: 'initial',
					commits: info.commits,
				},
			]
		} else {
			const bump = calculateSingleBumpFromInfo(info, config)
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
	let installResult = await $({ cwd })`${ciCmd}`.nothrow()
	if (installResult.exitCode !== 0) {
		// Fall back to regular install
		const cmd = getInstallCommand(pm)
		installResult = await $({ cwd })`${cmd}`.nothrow()
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
			const stderr = publishResult.stderr
			// Provide helpful message for blocked versions
			if (
				stderr.includes('Cannot publish over previously published version') ||
				stderr.includes('cannot publish over the previously published versions')
			) {
				consola.error(`  Version ${bump.newVersion} is blocked on npm`)
				consola.info(`  → Manually bump to a higher version and create a new PR`)
			} else {
				consola.error(`  Failed to publish ${bump.package}: ${stderr}`)
			}
			allSuccess = false
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
 * Compares package.json versions with npm - publishes any that are newer
 */
async function runPublishFromReleaseCommit(
	cwd: string,
	options: PublishOptions
): Promise<PublishResult> {
	consola.start('Publishing from release commit...')

	// Load config and packages
	const config = await loadConfig(cwd)
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	// Build list of packages to publish by comparing local vs npm versions
	const packagesToPublish: Array<{ name: string; version: string; path: string }> = []

	if (packages.length > 0) {
		// Monorepo: check each package
		for (const pkg of packages) {
			// Skip private packages - they should never be published
			if (pkg.private) continue
			const npmVersion = await getNpmPublishedVersion(pkg.name)
			// Publish if: not on npm yet, or local version is different from npm version
			if (!npmVersion || pkg.version !== npmVersion) {
				packagesToPublish.push({ name: pkg.name, version: pkg.version, path: pkg.path })
			}
		}
	} else {
		// Single package
		const pkg = getSinglePackage(cwd)
		if (pkg) {
			const npmVersion = await getNpmPublishedVersion(pkg.name)
			if (!npmVersion || pkg.version !== npmVersion) {
				packagesToPublish.push({ name: pkg.name, version: pkg.version, path: cwd })
			}
		}
	}

	if (packagesToPublish.length === 0) {
		consola.info('All packages are already published')
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

	// Install dependencies (with workspace:* intact)
	consola.start('Installing dependencies...')
	const pm = detectPM(cwd)
	const ciCmd = getInstallCommandCI(pm)
	let installResult = await $({ cwd })`${ciCmd}`.nothrow()
	if (installResult.exitCode !== 0) {
		const cmd = getInstallCommand(pm)
		installResult = await $({ cwd })`${cmd}`.nothrow()
		if (installResult.exitCode !== 0) {
			consola.warn('Install had issues, continuing...')
		}
	}

	// Pre-build ALL packages BEFORE resolving workspace deps
	// This ensures builds can use workspace: protocol for local resolution
	// Must build from root to handle inter-package dependencies correctly
	consola.start('Building packages...')
	const rootPkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'))
	if (rootPkg.scripts?.build) {
		const runCmd = getRunCommand(pm)
		const buildResult = await $({ cwd })`${runCmd} build`.nothrow()
		if (buildResult.exitCode !== 0) {
			consola.error('  Build failed')
			consola.error(buildResult.stderr)
			process.exit(1)
		}
		consola.info('  All packages built successfully')
	} else {
		consola.info('  No build script found, skipping')
	}

	// Resolve workspace deps for publish (temporary)
	// Now safe to resolve since all builds are complete
	let workspaceDepsSnapshot: ReturnType<typeof saveWorkspaceDeps> | null = null
	if (packages.length > 0) {
		workspaceDepsSnapshot = saveWorkspaceDeps(cwd, packages)
		resolveAllWorkspaceDeps(cwd, packages)
		consola.info('  Resolved workspace dependencies')
	}

	// Publish (skip scripts since we already built)
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
		consola.info(`  Publishing ${pc.cyan(pkg.name)}@${pc.green(pkg.version)}...`)
		// Use --ignore-scripts since we already built all packages
		const publishResult = await $({ cwd: pkg.path })`npm publish --access public --ignore-scripts`.nothrow()

		if (publishResult.exitCode !== 0) {
			const stderr = publishResult.stderr
			// Provide helpful message for blocked versions
			if (
				stderr.includes('Cannot publish over previously published version') ||
				stderr.includes('cannot publish over the previously published versions')
			) {
				consola.error(`  Version ${pkg.version} is blocked on npm`)
				consola.info(`  → Manually bump to a higher version and create a new PR`)
			} else {
				consola.error(`  Failed to publish ${pkg.name}: ${stderr}`)
			}
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
