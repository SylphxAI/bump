import consola from 'consola'
import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'zx'

// Configure zx
$.quiet = true
import pc from 'picocolors'
import {
	calculateBumpWithBumpFiles,
	calculateCascadeBumps,
	consumeBumpFiles,
	createInitialBump,
	discoverPackages,
	filterCommitsForPackage,
	generateChangelogEntry,
	getPackageReleaseInfos,
	getSinglePackage,
	getSinglePackageReleaseInfo,
	hasChangesToProcess,
	incrementVersion,
	isMonorepo,
	loadConfig,
	readBumpFiles,
	readBumpState,
	updateChangelog,
	updatePackageVersion,
	writeBumpState,
} from '../core/index.ts'
import type { VersionBump } from '../types.ts'
import { getCurrentBranch, getGitHubRepoUrl, getGitRoot } from '../utils/git.ts'

export interface PrOptions {
	cwd?: string
	baseBranch?: string
	dryRun?: boolean
}

const PR_BRANCH = 'bump/release'
const PR_TITLE_PREFIX = 'chore(release):'

/**
 * Generate PR body with release information
 */
function generatePrBody(
	bumps: VersionBump[],
	config: ReturnType<typeof import('../core/config.ts').getDefaultConfig>,
	repoUrl?: string,
	headCommit?: string
): string {
	const lines: string[] = []

	lines.push('## 🚀 Release')
	lines.push('')

	if (bumps.length === 1 && bumps[0]) {
		const bump = bumps[0]
		lines.push(`This PR will release **${bump.package}** version **${bump.newVersion}**`)
	} else {
		// Monorepo summary table
		lines.push('This PR will release the following packages:')
		lines.push('')
		lines.push('| Package | Current | New | Type |')
		lines.push('|---------|---------|-----|------|')
		for (const bump of bumps) {
			const current = bump.releaseType === 'initial' ? '—' : bump.currentVersion
			lines.push(
				`| \`${bump.package}\` | ${current} | **${bump.newVersion}** | ${bump.releaseType} |`
			)
		}
	}

	// Statistics
	const totalCommits = bumps.reduce((acc, b) => acc + b.commits.length, 0)
	// Initial releases can't have breaking changes - no one is using the package yet
	const breakingChanges = bumps
		.filter((b) => b.releaseType !== 'initial')
		.reduce((acc, b) => acc + b.commits.filter((c) => c.breaking).length, 0)

	lines.push('')
	lines.push('<details>')
	lines.push('<summary>📊 Statistics</summary>')
	lines.push('')
	lines.push(`- **Packages:** ${bumps.length}`)
	lines.push(`- **Total commits:** ${totalCommits}`)
	if (breakingChanges > 0) {
		lines.push(`- **Breaking changes:** ${breakingChanges} ⚠️`)
	}
	if (headCommit) {
		const shortHash = headCommit.slice(0, 7)
		const commitLink = repoUrl
			? `[\`${shortHash}\`](${repoUrl}/commit/${headCommit})`
			: `\`${shortHash}\``
		lines.push(`- **Based on:** ${commitLink}`)
	}
	lines.push('')
	lines.push('</details>')

	lines.push('')
	lines.push('---')
	lines.push('')

	// Add changelog preview for each bump
	// For large monorepos (>3 packages), collapse changelogs to avoid hitting GitHub's 65536 char limit
	const shouldCollapse = bumps.length > 3

	for (const bump of bumps) {
		// Initial releases can't have breaking changes - no one is using the package yet
		const hasBreaking = bump.releaseType !== 'initial' && bump.commits.some((c) => c.breaking)
		const breakingBadge = hasBreaking ? ' ⚠️' : ''
		const changelog = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
		// For initial releases, show "→ version" instead of "version → version"
		const versionDisplay =
			bump.releaseType === 'initial'
				? `<code>${bump.newVersion}</code> (initial)`
				: `<code>${bump.currentVersion}</code> → <code>${bump.newVersion}</code>`
		const versionDisplayPlain =
			bump.releaseType === 'initial'
				? `\`${bump.newVersion}\` (initial)`
				: `\`${bump.currentVersion}\` → \`${bump.newVersion}\``

		if (bumps.length > 1) {
			if (shouldCollapse) {
				// Collapse each package's changelog
				lines.push('<details>')
				lines.push(
					`<summary><strong>📦 ${bump.package}</strong> ${versionDisplay}${breakingBadge}</summary>`
				)
				lines.push('')
				lines.push(changelog)
				lines.push('')
				lines.push('</details>')
				lines.push('')
			} else {
				lines.push(`### 📦 ${bump.package} ${versionDisplayPlain}${breakingBadge}`)
				lines.push('')
				lines.push(changelog)
				lines.push('')
			}
		} else {
			lines.push(changelog)
			lines.push('')
		}
	}

	lines.push('---')
	lines.push('')
	lines.push('> **Merging this PR will:**')
	lines.push('> - Update package.json version(s)')
	lines.push('> - Update CHANGELOG.md')
	lines.push('> - Publish to npm')
	lines.push('> - Create GitHub Release')
	lines.push('')
	lines.push('> [!IMPORTANT]')
	lines.push('> **Please use "Squash and merge"** to merge this PR.')
	lines.push('')
	lines.push(
		'_This PR is automatically maintained by [@sylphx/bump](https://github.com/SylphxAI/bump)_'
	)

	return lines.join('\n')
}

/**
 * Check if release PR exists
 */
async function findReleasePr(): Promise<{ number: number; headRefName: string } | null> {
	try {
		const result = await $`gh pr list --head ${PR_BRANCH} --json number,headRefName`
		const parsed = JSON.parse(result.stdout)
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed[0] as { number: number; headRefName: string }
		}
		return null
	} catch {
		return null
	}
}

/**
 * Create or update release PR
 */
export async function runPr(options: PrOptions = {}): Promise<void> {
	// Block local execution - bump pr only works with CI workflow
	if (!process.env.CI && !process.env.GITHUB_ACTIONS) {
		consola.error('bump pr should only be run in CI environment')
		consola.info('Push to main and let GitHub Actions create the release PR')
		process.exit(1)
	}

	// Check for GitHub token
	if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
		consola.error('GITHUB_TOKEN or GH_TOKEN environment variable is required')
		process.exit(1)
	}

	const cwd = options.cwd ?? process.cwd()

	// Parallel initialization
	const [config, gitRoot] = await Promise.all([loadConfig(cwd), getGitRoot()])
	const baseBranch = options.baseBranch ?? config.baseBranch ?? 'main'

	consola.start('Analyzing commits and changesets for release PR...')

	// Read bump files
	const bumpFiles = readBumpFiles(cwd)
	if (bumpFiles.length > 0) {
		consola.info(`Found ${bumpFiles.length} bump file(s)`)
	}

	// Calculate bumps
	let bumps: VersionBump[] = []
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	if (packages.length > 0) {
		// Monorepo mode
		const packageInfos = await getPackageReleaseInfos(packages)

		for (const { pkg, npmVersion, commits } of packageInfos) {
			// Skip private packages
			if (pkg.private) continue

			// Filter commits to only those affecting this package
			const pkgCommits = filterCommitsForPackage(commits, pkg.name, pkg.path, gitRoot)

			// Check if there are changes to process (commits or bump files)
			if (!hasChangesToProcess(pkgCommits, bumpFiles)) {
				continue
			}

			// First release
			if (!npmVersion) {
				const bump = createInitialBump(pkg, pkgCommits)
				consola.info(`First release: ${pkg.name}@${bump.newVersion}`)
				bumps.push(bump)
				continue
			}

			// Calculate bump with bump file support
			const bump = calculateBumpWithBumpFiles(pkg, pkgCommits, bumpFiles, config)
			if (bump) {
				bumps.push(bump)
			}
		}

		if (bumps.length === 0) {
			consola.info('No changes to release')

			// Close existing PR if no changes
			const existingPr = await findReleasePr()
			if (existingPr) {
				consola.info('Closing existing release PR (no changes)')
				if (!options.dryRun) {
					try {
						await $`gh pr close ${existingPr.number} --delete-branch`
					} catch {
						// Ignore errors
					}
				}
			}
			return
		}

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
		// Single package mode
		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return
		}

		const info = await getSinglePackageReleaseInfo(pkg)

		// Check if there are changes to process
		if (!hasChangesToProcess(info.commits, bumpFiles)) {
			consola.info('No changes to release')

			// Close existing PR if no changes
			const existingPr = await findReleasePr()
			if (existingPr) {
				consola.info('Closing existing release PR (no changes)')
				if (!options.dryRun) {
					try {
						await $`gh pr close ${existingPr.number} --delete-branch`
					} catch {
						// Ignore errors
					}
				}
			}
			return
		}

		// First release
		if (!info.npmVersion) {
			const bump = createInitialBump(pkg, info.commits)
			consola.info(`First release: ${pkg.name}@${bump.newVersion}`)
			bumps = [bump]
		} else {
			// Calculate bump with bump file support
			const bump = calculateBumpWithBumpFiles(pkg, info.commits, bumpFiles, config)
			if (bump) bumps = [bump]
		}
	}

	if (bumps.length === 0) {
		consola.info('No version bumps needed')
		return
	}

	// Generate PR content
	const repoUrl = await getGitHubRepoUrl()
	const headCommit = (await $`git rev-parse HEAD`.quiet()).stdout.trim()

	// Generate descriptive PR title
	let prTitle: string
	if (bumps.length === 1 && bumps[0]) {
		prTitle = `${PR_TITLE_PREFIX} ${bumps[0].package}@${bumps[0].newVersion}`
	} else {
		// For monorepo, list all packages being released
		const pkgVersions = bumps.map((b) => `${b.package}@${b.newVersion}`)
		if (pkgVersions.length <= 3) {
			prTitle = `${PR_TITLE_PREFIX} ${pkgVersions.join(', ')}`
		} else {
			prTitle = `${PR_TITLE_PREFIX} ${bumps.length} packages`
		}
	}

	const prBody = generatePrBody(bumps, config, repoUrl ?? undefined, headCommit)

	consola.box(
		bumps
			.map(
				(b) =>
					`${pc.cyan(b.package)}: ${pc.dim(b.currentVersion)} → ${pc.green(b.newVersion)} (${b.releaseType})`
			)
			.join('\n')
	)

	if (options.dryRun) {
		consola.info('Dry run - would create/update PR:')
		consola.info(`${pc.dim('Title:')} ${prTitle}`)
		consola.info(pc.dim('Body:'))
		consola.info(prBody)
		return
	}

	// Check current branch
	const currentBranch = await getCurrentBranch()
	if (currentBranch !== baseBranch) {
		consola.warn(`Not on ${baseBranch} branch. Release PR should be created from ${baseBranch}.`)
		return
	}

	// Check for existing PR
	const existingPr = await findReleasePr()

	// Helper to apply version changes and consume bump files
	const applyVersionChanges = () => {
		for (const bump of bumps) {
			const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
			updatePackageVersion(pkgPath, bump.newVersion)

			// Update CHANGELOG.md
			const entry = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
			updateChangelog(pkgPath, entry, config)
		}

		// Consume (delete) bump files - they'll be removed when PR is merged
		if (bumpFiles.length > 0) {
			consumeBumpFiles(bumpFiles)
		}
	}

	try {
		if (existingPr) {
			// Update existing PR
			consola.start('Updating existing release PR...')

			// Convert to draft to prevent merge during update
			await $`gh pr ready --undo ${existingPr.number}`.quiet().nothrow()

			// Switch to PR branch and update
			await $`git fetch origin ${PR_BRANCH}:${PR_BRANCH} 2>/dev/null || true`.quiet()
			await $`git checkout -B ${PR_BRANCH}`
			await $`git reset --hard origin/${baseBranch}`

			// Apply actual version changes
			applyVersionChanges()

			// Commit changes
			await $`git add -A`
			await $`git commit -m ${prTitle}`
			// Force push needed because we reset the PR branch to baseBranch
			await $`git push -f origin ${PR_BRANCH}`

			// Update PR title/body (use stdin to avoid E2BIG for large bodies)
			const editProc = $`gh pr edit ${existingPr.number} --title ${prTitle} --body-file -`
			editProc.stdin.write(prBody)
			editProc.stdin.end()
			await editProc

			// Mark PR ready (allow merge again)
			await $`gh pr ready ${existingPr.number}`.quiet().nothrow()

			// Switch back
			await $`git checkout ${baseBranch}`

			consola.success(`Updated PR #${existingPr.number}`)
			if (repoUrl) {
				consola.info(`${repoUrl}/pull/${existingPr.number}`)
			}
		} else {
			// Create new PR
			consola.start('Creating release PR...')

			// Create branch (force to overwrite if exists locally)
			await $`git checkout -B ${PR_BRANCH}`

			// Apply actual version changes
			applyVersionChanges()

			// Commit changes
			await $`git add -A`
			await $`git commit -m ${prTitle}`
			// Force push to overwrite any stale remote branch
			await $`git push -f -u origin ${PR_BRANCH}`

			// Last resort: truncate PR body if still exceeds GitHub's 65536 character limit
			// This shouldn't happen with collapsed changelogs, but keep as safety net
			const MAX_BODY_LENGTH = 65000
			let finalBody = prBody
			if (prBody.length > MAX_BODY_LENGTH) {
				consola.warn(`PR body exceeds limit (${prBody.length} chars), truncating...`)
				const truncateMsg = '\n\n---\n\n> ⚠️ **Changelog truncated** - See individual package CHANGELOGs for full details.'
				finalBody = prBody.slice(0, MAX_BODY_LENGTH - truncateMsg.length) + truncateMsg
			}

			// Create PR using temp file to avoid E2BIG for large bodies
			let prUrl: string
			const tmpFile = join(cwd, '.bump-pr-body.md')
			writeFileSync(tmpFile, finalBody)
			try {
				const createResult = await $`gh pr create --title ${prTitle} --body-file ${tmpFile} --base ${baseBranch}`
					.quiet()
					.nothrow()
				if (createResult.exitCode === 0) {
					prUrl = createResult.stdout.trim()
				} else {
					// Check if there's a stale PR (merged/closed) blocking new PR creation
					const viewResult = await $`gh pr view ${PR_BRANCH} --json url,state`.quiet().nothrow()
					if (viewResult.exitCode === 0) {
						const prInfo = JSON.parse(viewResult.stdout)
						if (prInfo.state === 'OPEN') {
							// There's an open PR - use it
							prUrl = prInfo.url
						} else {
							// PR is merged/closed - the branch still exists on remote
							// This shouldn't happen since we force-pushed, but handle it
							consola.warn('Stale PR branch detected, retrying...')
							// Delete remote branch and retry
							await $`git push origin --delete ${PR_BRANCH}`.quiet().nothrow()
							await $`git push -f -u origin ${PR_BRANCH}`
							const retryResult = await $`gh pr create --title ${prTitle} --body-file ${tmpFile} --base ${baseBranch}`
								.quiet()
								.nothrow()
							if (retryResult.exitCode === 0) {
								prUrl = retryResult.stdout.trim()
							} else {
								throw new Error(`Failed to create PR after retry: ${retryResult.stderr.toString()}`)
							}
						}
					} else {
						throw new Error(
							`Failed to create or find PR. Create error: ${createResult.stderr.toString()}`
						)
					}
				}
			} finally {
				// Clean up temp file
				try {
					unlinkSync(tmpFile)
				} catch {
					// Ignore cleanup errors
				}
			}

			// Switch back
			await $`git checkout ${baseBranch}`

			consola.success('Created release PR')
			consola.info(prUrl)
		}
	} catch (error) {
		// Make sure we switch back to original branch and mark PR ready if it was converted to draft
		await $`git checkout ${baseBranch}`.quiet().nothrow()
		if (existingPr) {
			await $`gh pr ready ${existingPr.number}`.quiet().nothrow()
		}
		throw error
	}
}
