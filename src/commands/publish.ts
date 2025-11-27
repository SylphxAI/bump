import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import consola from 'consola'
import pc from 'picocolors'
import {
	discoverPackages,
	generateChangelogEntry,
	isMonorepo,
	loadConfig,
	updateChangelog,
} from '../core/index.ts'
import { getGitHubRepoUrl } from '../utils/git.ts'
import type { VersionBump } from '../types.ts'

const PENDING_FILE = '.bump-pending.json'

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
 * Publish packages from .bump-pending.json
 * This runs after PR merge - applies version changes, publishes, then commits
 */
export async function runPublish(options: PublishOptions = {}): Promise<boolean> {
	const cwd = options.cwd ?? process.cwd()
	const pendingFile = join(cwd, PENDING_FILE)

	// Check for pending bumps
	if (!existsSync(pendingFile)) {
		consola.info('No .bump-pending.json found - nothing to publish')
		return false
	}

	// Read pending bumps
	const bumpsJson = readFileSync(pendingFile, 'utf-8')
	const bumps: VersionBump[] = JSON.parse(bumpsJson)

	if (bumps.length === 0) {
		consola.info('No bumps pending')
		unlinkSync(pendingFile)
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

	const config = await loadConfig(cwd)
	const repoUrl = await getGitHubRepoUrl()
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

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

	// Step 6: Cleanup .bump-pending.json
	unlinkSync(pendingFile)
	await $`git add ${PENDING_FILE}`.quiet().nothrow()
	await $`git commit -m "chore: cleanup .bump-pending.json"`.quiet().nothrow()
	await $`git push`.quiet().nothrow()

	// Step 7: Create GitHub releases
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
