import { $ } from 'bun'
import consola from 'consola'
import pc from 'picocolors'
import {
	calculateMonorepoBumps,
	calculateSingleBump,
	discoverPackages,
	generateChangelogEntry,
	getConventionalCommits,
	getSinglePackage,
	isMonorepo,
	loadConfig,
	type MonorepoBumpContext,
	updateChangelog,
} from '../core/index.ts'
import type { VersionBump } from '../types.ts'
import {
	getAllTags,
	getCurrentBranch,
	getGitHubRepoUrl,
	getGitRoot,
	getLatestTag,
	getLatestTagForPackage,
} from '../utils/git.ts'

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
	repoUrl?: string
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
			lines.push(
				`| \`${bump.package}\` | ${bump.currentVersion} | **${bump.newVersion}** | ${bump.releaseType} |`
			)
		}
	}

	// Statistics
	const totalCommits = bumps.reduce((acc, b) => acc + b.commits.length, 0)
	const breakingChanges = bumps.reduce((acc, b) => acc + b.commits.filter((c) => c.breaking).length, 0)

	lines.push('')
	lines.push('<details>')
	lines.push('<summary>📊 Statistics</summary>')
	lines.push('')
	lines.push(`- **Packages:** ${bumps.length}`)
	lines.push(`- **Total commits:** ${totalCommits}`)
	if (breakingChanges > 0) {
		lines.push(`- **Breaking changes:** ${breakingChanges} ⚠️`)
	}
	lines.push('')
	lines.push('</details>')

	lines.push('')
	lines.push('---')
	lines.push('')

	// Add changelog preview for each bump
	for (const bump of bumps) {
		if (bumps.length > 1) {
			const hasBreaking = bump.commits.some((c) => c.breaking)
			const breakingBadge = hasBreaking ? ' ⚠️' : ''
			lines.push(`### 📦 ${bump.package} \`${bump.currentVersion}\` → \`${bump.newVersion}\`${breakingBadge}`)
			lines.push('')
		}

		const changelog = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
		lines.push(changelog)
		lines.push('')
	}

	lines.push('---')
	lines.push('')
	lines.push('> **Merging this PR will:**')
	lines.push('> - Update package.json version(s)')
	lines.push('> - Update CHANGELOG.md')
	lines.push('> - Publish to npm')
	lines.push('> - Create GitHub Release')
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
		const result = await $`gh pr list --head ${PR_BRANCH} --json number,headRefName`.json()
		if (Array.isArray(result) && result.length > 0) {
			return result[0] as { number: number; headRefName: string }
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
	const cwd = options.cwd ?? process.cwd()
	const config = await loadConfig(cwd)
	const baseBranch = options.baseBranch ?? config.baseBranch ?? 'main'
	const gitRoot = await getGitRoot()

	consola.start('Analyzing commits for release PR...')

	// Calculate bumps
	let bumps: VersionBump[] = []
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	if (packages.length > 0) {
		// Pre-fetch all tags once for reuse
		const allTags = await getAllTags()

		// Process all packages in parallel
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
			}
		}

		if (contexts.length === 0) {
			consola.info('No new commits since last releases')

			// Close existing PR if no changes
			const existingPr = await findReleasePr()
			if (existingPr) {
				consola.info('Closing existing release PR (no changes)')
				if (!options.dryRun) {
					await $`gh pr close ${existingPr.number} --delete-branch`.quiet()
				}
			}
			return
		}

		bumps = calculateMonorepoBumps(contexts, config, { gitRoot })
	} else {
		// Single package mode
		const latestTag = await getLatestTag()
		const commits = await getConventionalCommits(latestTag ?? undefined)

		if (commits.length === 0) {
			consola.info('No new commits since last release')

			// Close existing PR if no changes
			const existingPr = await findReleasePr()
			if (existingPr) {
				consola.info('Closing existing release PR (no changes)')
				if (!options.dryRun) {
					await $`gh pr close ${existingPr.number} --delete-branch`.quiet()
				}
			}
			return
		}

		const pkg = getSinglePackage(cwd)
		if (!pkg) {
			consola.error('No package.json found')
			return
		}
		const bump = calculateSingleBump(pkg, commits, config)
		if (bump) bumps = [bump]
	}

	if (bumps.length === 0) {
		consola.info('No version bumps needed')
		return
	}

	// Generate PR content
	const repoUrl = await getGitHubRepoUrl()

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

	const prBody = generatePrBody(bumps, config, repoUrl ?? undefined)

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
		console.log(pc.dim('Title:'), prTitle)
		console.log(pc.dim('Body:'))
		console.log(prBody)
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

	try {
		if (existingPr) {
			// Update existing PR
			consola.start('Updating existing release PR...')

			// Switch to PR branch and update
			await $`git fetch origin ${PR_BRANCH}:${PR_BRANCH} 2>/dev/null || true`.quiet()
			await $`git checkout -B ${PR_BRANCH}`
			await $`git reset --hard origin/${baseBranch}`

			// Apply version changes and update changelogs
			for (const bump of bumps) {
				const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
				await $`cd ${pkgPath} && npm version ${bump.newVersion} --no-git-tag-version`.quiet()

				// Update CHANGELOG.md
				const entry = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
				updateChangelog(pkgPath, entry, config)
			}

			// Commit and push
			await $`git add -A`
			await $`git commit -m ${prTitle} --allow-empty`
			await $`git push -f origin ${PR_BRANCH}`

			// Update PR
			await $`gh pr edit ${existingPr.number} --title ${prTitle} --body ${prBody}`

			// Switch back
			await $`git checkout ${baseBranch}`

			consola.success(`Updated PR #${existingPr.number}`)
			consola.info(
				`https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pull/${existingPr.number}`
			)
		} else {
			// Create new PR
			consola.start('Creating release PR...')

			// Create branch (force to overwrite if exists locally)
			await $`git checkout -B ${PR_BRANCH}`

			// Apply version changes and update changelogs
			for (const bump of bumps) {
				const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
				await $`cd ${pkgPath} && npm version ${bump.newVersion} --no-git-tag-version`.quiet()

				// Update CHANGELOG.md
				const entry = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
				updateChangelog(pkgPath, entry, config)
			}

			// Commit and push (force push in case branch exists on remote)
			await $`git add -A`
			await $`git commit -m ${prTitle}`
			await $`git push -f -u origin ${PR_BRANCH}`

			// Create PR (or get existing if branch already has PR)
			const prResult = await $`gh pr create --title ${prTitle} --body ${prBody} --base ${baseBranch} 2>&1 || gh pr view ${PR_BRANCH} --json url -q .url`.text()

			// Switch back
			await $`git checkout ${baseBranch}`

			consola.success('Created release PR')
			consola.info(prResult.trim())
		}
	} catch (error) {
		// Make sure we switch back to original branch
		await $`git checkout ${baseBranch}`.quiet().nothrow()
		throw error
	}
}
