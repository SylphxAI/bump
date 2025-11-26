import { $ } from 'bun'
import consola from 'consola'
import pc from 'picocolors'
import {
	calculateBumps,
	calculateSingleBump,
	discoverPackages,
	generateChangelogEntry,
	getConventionalCommits,
	getSinglePackage,
	isMonorepo,
	loadConfig,
} from '../core/index.ts'
import type { VersionBump } from '../types.ts'
import { getCurrentBranch, getGitHubRepoUrl, getLatestTag } from '../utils/git.ts'

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
		lines.push('This PR will release the following packages:')
		lines.push('')
		for (const bump of bumps) {
			lines.push(`- **${bump.package}**: ${bump.currentVersion} → ${bump.newVersion}`)
		}
	}

	lines.push('')
	lines.push('---')
	lines.push('')

	// Add changelog preview for each bump
	for (const bump of bumps) {
		if (bumps.length > 1) {
			lines.push(`### 📦 ${bump.package}`)
			lines.push('')
		}

		const changelog = generateChangelogEntry(bump, config, { repoUrl: repoUrl ?? undefined })
		lines.push(changelog)
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

	consola.start('Analyzing commits for release PR...')

	// Get commits since last tag
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

	// Calculate bumps
	let bumps: VersionBump[] = []
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []

	if (packages.length > 0) {
		bumps = calculateBumps(packages, commits, config)
	} else {
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
	const version = bumps.length === 1 ? bumps[0]?.newVersion : 'packages'
	const prTitle = `${PR_TITLE_PREFIX} ${version}`
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
			await $`git checkout -B ${PR_BRANCH}`.quiet()
			await $`git reset --hard origin/${baseBranch}`.quiet()

			// Apply version changes
			for (const bump of bumps) {
				const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
				await $`cd ${pkgPath} && npm version ${bump.newVersion} --no-git-tag-version`.quiet()
			}

			// Commit and push
			await $`git add -A`.quiet()
			await $`git commit -m ${prTitle} --allow-empty`.quiet()
			await $`git push -f origin ${PR_BRANCH}`.quiet()

			// Update PR
			await $`gh pr edit ${existingPr.number} --title ${prTitle} --body ${prBody}`

			// Switch back
			await $`git checkout ${baseBranch}`.quiet()

			consola.success(`Updated PR #${existingPr.number}`)
			consola.info(
				`https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pull/${existingPr.number}`
			)
		} else {
			// Create new PR
			consola.start('Creating release PR...')

			// Create branch
			await $`git checkout -B ${PR_BRANCH}`.quiet()

			// Apply version changes
			for (const bump of bumps) {
				const pkgPath = packages.find((p) => p.name === bump.package)?.path ?? cwd
				await $`cd ${pkgPath} && npm version ${bump.newVersion} --no-git-tag-version`.quiet()
			}

			// Commit and push
			await $`git add -A`.quiet()
			await $`git commit -m ${prTitle}`.quiet()
			await $`git push -u origin ${PR_BRANCH}`.quiet()

			// Create PR
			const prUrl =
				await $`gh pr create --title ${prTitle} --body ${prBody} --base ${baseBranch}`.text()

			// Switch back
			await $`git checkout ${baseBranch}`.quiet()

			consola.success('Created release PR')
			consola.info(prUrl.trim())
		}
	} catch (error) {
		// Make sure we switch back to original branch
		await $`git checkout ${baseBranch}`.quiet()
		throw error
	}
}
