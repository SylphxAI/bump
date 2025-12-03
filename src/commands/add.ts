import consola from 'consola'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getBumpDir, isExplicitVersion } from '../core/bumpfile.ts'
import { discoverPackages, isMonorepo } from '../core/packages.ts'
import { loadConfig } from '../core/config.ts'

export interface AddOptions {
	/** Release type or explicit version */
	release?: string
	/** Prerelease identifier (alpha, beta, rc) */
	prerelease?: string
	/** Target package(s) */
	packages?: string[]
	/** Custom message/content */
	message?: string
	/** Working directory */
	cwd?: string
}

/**
 * Generate a unique bump file name
 */
function generateBumpFileName(cwd: string): string {
	const bumpDir = getBumpDir(cwd)
	const timestamp = Date.now().toString(36)
	const random = Math.random().toString(36).slice(2, 6)
	return join(bumpDir, `${timestamp}-${random}.md`)
}

/**
 * Create a bump file
 */
export async function runAdd(options: AddOptions = {}): Promise<string> {
	const cwd = options.cwd ?? process.cwd()
	const bumpDir = getBumpDir(cwd)

	// Ensure .bump directory exists
	if (!existsSync(bumpDir)) {
		mkdirSync(bumpDir, { recursive: true })
	}

	// Determine release type
	let release = options.release ?? 'patch'

	// Validate release
	const validReleaseTypes = ['patch', 'minor', 'major']
	if (!validReleaseTypes.includes(release) && !isExplicitVersion(release)) {
		consola.error(`Invalid release type: ${release}`)
		consola.info('Valid types: patch, minor, major, or explicit version (e.g., "1.2.3")')
		process.exit(1)
	}

	// Build frontmatter
	const frontmatter: string[] = []

	// Quote explicit versions
	if (isExplicitVersion(release)) {
		frontmatter.push(`release: "${release}"`)
	} else {
		frontmatter.push(`release: ${release}`)
	}

	// Add prerelease if specified
	if (options.prerelease) {
		frontmatter.push(`prerelease: ${options.prerelease}`)
	}

	// Add package(s) if specified
	if (options.packages && options.packages.length > 0) {
		if (options.packages.length === 1) {
			frontmatter.push(`package: ${options.packages[0]}`)
		} else {
			frontmatter.push('packages:')
			for (const pkg of options.packages) {
				frontmatter.push(`  - ${pkg}`)
			}
		}
	}

	// Build content
	const content = options.message ?? ''

	// Generate file content
	const fileContent = `---
${frontmatter.join('\n')}
---

${content}
`.trim() + '\n'

	// Write file
	const filePath = generateBumpFileName(cwd)
	writeFileSync(filePath, fileContent)

	// Display result
	const relativePath = filePath.replace(cwd + '/', '')
	consola.success(`Created ${relativePath}`)

	// Show preview
	console.log('')
	console.log('```')
	console.log(fileContent.trim())
	console.log('```')
	console.log('')

	// Show what will happen
	let versionPreview = ''
	if (isExplicitVersion(release)) {
		versionPreview = release
	} else {
		versionPreview = `x.x.x → ${release} bump`
		if (options.prerelease) {
			versionPreview += ` (${options.prerelease})`
		}
	}
	consola.info(`Will create: ${versionPreview}`)

	if (options.packages && options.packages.length > 0) {
		consola.info(`Packages: ${options.packages.join(', ')}`)
	}

	consola.info('Commit and push to trigger release PR')

	return filePath
}

/**
 * Interactive mode for bump add
 */
export async function runAddInteractive(options: AddOptions = {}): Promise<string> {
	const cwd = options.cwd ?? process.cwd()
	const config = await loadConfig(cwd)

	// Check if monorepo
	const packages = isMonorepo(cwd) ? await discoverPackages(cwd, config) : []
	const isMonorepoProject = packages.length > 0

	// Prompt for release type
	const release = await consola.prompt('Release type:', {
		type: 'select',
		options: [
			{ label: 'patch - Bug fixes', value: 'patch' },
			{ label: 'minor - New features', value: 'minor' },
			{ label: 'major - Breaking changes', value: 'major' },
			{ label: 'custom - Explicit version', value: 'custom' },
		],
	})

	if (typeof release === 'symbol') {
		process.exit(0)
	}

	let finalRelease = release as string
	if (release === 'custom') {
		const customVersion = await consola.prompt('Enter version (e.g., 1.2.3):', {
			type: 'text',
		})
		if (typeof customVersion === 'symbol' || !customVersion) {
			process.exit(0)
		}
		finalRelease = customVersion
	}

	// Prompt for prerelease
	const prereleaseChoice = await consola.prompt('Prerelease?', {
		type: 'select',
		options: [
			{ label: 'No - Stable release', value: '' },
			{ label: 'alpha', value: 'alpha' },
			{ label: 'beta', value: 'beta' },
			{ label: 'rc - Release candidate', value: 'rc' },
		],
	})

	if (typeof prereleaseChoice === 'symbol') {
		process.exit(0)
	}

	const prerelease = prereleaseChoice || undefined

	// Prompt for packages if monorepo
	let selectedPackages: string[] | undefined
	if (isMonorepoProject) {
		const packageChoice = await consola.prompt('Which packages?', {
			type: 'select',
			options: [
				{ label: 'All packages', value: 'all' },
				{ label: 'Select specific packages', value: 'select' },
			],
		})

		if (typeof packageChoice === 'symbol') {
			process.exit(0)
		}

		if (packageChoice === 'select') {
			const selected = await consola.prompt('Select packages:', {
				type: 'multiselect',
				options: packages.filter((p) => !p.private).map((p) => ({
					label: p.name,
					value: p.name,
				})),
			})

			if (typeof selected === 'symbol') {
				process.exit(0)
			}

			selectedPackages = selected as string[]
		}
	}

	// Prompt for message
	const message = await consola.prompt('Changelog message (optional):', {
		type: 'text',
		placeholder: 'Describe the changes...',
	})

	if (typeof message === 'symbol') {
		process.exit(0)
	}

	return runAdd({
		release: finalRelease,
		prerelease,
		packages: selectedPackages,
		message: message || undefined,
		cwd,
	})
}
