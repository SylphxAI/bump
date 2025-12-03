import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import consola from 'consola'
import { $ } from 'zx'

// Configure zx
$.quiet = true
import pc from 'picocolors'
import {
	discoverPackages,
	getSinglePackage,
	isMonorepo,
	loadConfig,
	resolveAllWorkspaceDeps,
	restoreWorkspaceDeps,
	saveWorkspaceDeps,
} from '../core/exports.ts'
import { PublishError, ValidationError } from '../utils/errors.ts'
import { getNpmPublishedVersion } from '../utils/npm.ts'
import { detectPM, getInstallCommand, getInstallCommandCI } from '../utils/pm.ts'

/**
 * ⚠️ IMPORTANT: Bump does NOT build packages. Building is CI's responsibility.
 *
 * Bump publish is IDEMPOTENT - it compares local version vs npm and publishes
 * what's different. Safe to re-run after partial failures.
 *
 * CI workflow should:
 *   1. Build all packages (bun run build, pnpm build, etc.)
 *   2. Run bump publish (which uses --ignore-scripts)
 *
 * Example:
 *   - run: pnpm build
 *   - uses: sylphxai/bump@v1
 *
 * DO NOT add build-related code here. Ever.
 */

export interface PublishOptions {
	cwd?: string
	dryRun?: boolean
}

export interface PublishResult {
	published: boolean
	packages: Array<{ name: string; version: string }>
}

interface PackageToProcess {
	name: string
	version: string
	path: string
	needsPublish: boolean
	needsTag: boolean
	tag: string
}

/**
 * Validate that package files exist before publishing
 * Checks: files, main, exports, types fields in package.json
 */
function validatePackageFiles(pkgPath: string): string[] {
	const errors: string[] = []
	const pkgJsonPath = join(pkgPath, 'package.json')

	if (!existsSync(pkgJsonPath)) {
		errors.push('package.json not found')
		return errors
	}

	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

	// 1. Check `files` field
	if (pkgJson.files && Array.isArray(pkgJson.files)) {
		for (const file of pkgJson.files) {
			// Skip negation patterns
			if (file.startsWith('!')) continue
			// For glob patterns, just check if the base directory exists
			const basePath = file.split('/')[0]?.split('*')[0]
			if (basePath) {
				const fullPath = join(pkgPath, basePath)
				if (!existsSync(fullPath)) {
					errors.push(`Missing: ${basePath} (listed in "files")`)
				} else if (basePath === file) {
					// If it's an exact path (not glob), check if directory is empty
					try {
						const stats = readdirSync(fullPath)
						if (stats.length === 0) {
							errors.push(`Empty directory: ${basePath} (listed in "files")`)
						}
					} catch {
						// Not a directory, that's fine
					}
				}
			}
		}
	}

	// 2. Check `main` field
	if (pkgJson.main) {
		const mainPath = join(pkgPath, pkgJson.main)
		if (!existsSync(mainPath)) {
			errors.push(`Missing: ${pkgJson.main} (listed in "main")`)
		}
	}

	// 3. Check `module` field
	if (pkgJson.module) {
		const modulePath = join(pkgPath, pkgJson.module)
		if (!existsSync(modulePath)) {
			errors.push(`Missing: ${pkgJson.module} (listed in "module")`)
		}
	}

	// 4. Check `types` / `typings` field
	const typesField = pkgJson.types || pkgJson.typings
	if (typesField) {
		const typesPath = join(pkgPath, typesField)
		if (!existsSync(typesPath)) {
			errors.push(`Missing: ${typesField} (listed in "types")`)
		}
	}

	// 5. Check `exports` field
	if (pkgJson.exports) {
		const checkExportPath = (exportPath: string, key: string) => {
			// Skip conditions like "node", "import", "require", "types", "default"
			if (typeof exportPath !== 'string') return
			// Skip negation or non-file patterns
			if (exportPath.startsWith('!') || !exportPath.startsWith('.')) return
			const fullPath = join(pkgPath, exportPath)
			if (!existsSync(fullPath)) {
				errors.push(`Missing: ${exportPath} (listed in "exports${key}")`)
			}
		}

		const walkExports = (obj: unknown, prefix: string) => {
			if (typeof obj === 'string') {
				checkExportPath(obj, prefix)
			} else if (obj && typeof obj === 'object') {
				for (const [key, value] of Object.entries(obj)) {
					walkExports(value, `${prefix}.${key}`)
				}
			}
		}

		walkExports(pkgJson.exports, '')
	}

	return errors
}

/**
 * Publish packages - idempotent, compares local version vs npm
 * Safe to re-run after partial failures
 */
export async function runPublish(options: PublishOptions = {}): Promise<PublishResult> {
	const cwd = options.cwd ?? process.cwd()

	consola.start('Checking packages to publish...')

	// Load config and packages
	const config = await loadConfig(cwd)
	const isMonorepoProject = isMonorepo(cwd)
	const packages = isMonorepoProject ? await discoverPackages(cwd, config) : []

	// Determine what needs publishing and tagging
	const toProcess: PackageToProcess[] = []

	if (packages.length > 0) {
		// Monorepo: check each package
		for (const pkg of packages) {
			// Skip private packages
			if (pkg.private) continue

			const npmVersion = await getNpmPublishedVersion(pkg.name)
			const tag = `${pkg.name}@${pkg.version}`
			const existingTag = await $`git tag -l ${tag}`.nothrow()
			const hasTag = !!existingTag.stdout.trim()

			if (pkg.version !== npmVersion) {
				// Needs publish and tag
				toProcess.push({
					name: pkg.name,
					version: pkg.version,
					path: pkg.path,
					needsPublish: true,
					needsTag: true,
					tag,
				})
			} else if (!hasTag) {
				// Already on npm but missing tag (from previous partial failure)
				toProcess.push({
					name: pkg.name,
					version: pkg.version,
					path: pkg.path,
					needsPublish: false,
					needsTag: true,
					tag,
				})
			}
		}
	} else {
		// Single package
		const pkg = getSinglePackage(cwd)
		if (pkg) {
			const npmVersion = await getNpmPublishedVersion(pkg.name)
			const tag = `v${pkg.version}`
			const existingTag = await $`git tag -l ${tag}`.nothrow()
			const hasTag = !!existingTag.stdout.trim()

			if (pkg.version !== npmVersion) {
				toProcess.push({
					name: pkg.name,
					version: pkg.version,
					path: cwd,
					needsPublish: true,
					needsTag: true,
					tag,
				})
			} else if (!hasTag) {
				toProcess.push({
					name: pkg.name,
					version: pkg.version,
					path: cwd,
					needsPublish: false,
					needsTag: true,
					tag,
				})
			}
		}
	}

	const toPublish = toProcess.filter((p) => p.needsPublish)
	const toTag = toProcess.filter((p) => p.needsTag)

	if (toPublish.length === 0 && toTag.length === 0) {
		consola.info('All packages are up to date')
		return { published: false, packages: [] }
	}

	// Display what we're going to do
	if (toPublish.length > 0) {
		consola.info(`Packages to publish: ${toPublish.length}`)
		for (const pkg of toPublish) {
			consola.info(`  ${pc.cyan(pkg.name)}@${pc.green(pkg.version)}`)
		}
	}

	if (toTag.length > toPublish.length) {
		const onlyTag = toProcess.filter((p) => !p.needsPublish && p.needsTag)
		consola.info(`Packages needing tags (already published): ${onlyTag.length}`)
		for (const pkg of onlyTag) {
			consola.info(`  ${pc.dim(pkg.name)}@${pc.dim(pkg.version)}`)
		}
	}

	if (options.dryRun) {
		consola.info('Dry run - no changes will be made')
		return {
			published: false,
			packages: toPublish.map((p) => ({ name: p.name, version: p.version })),
		}
	}

	// Validate packages before publishing (check files/main/exports/types exist)
	if (toPublish.length > 0) {
		consola.start('Validating packages...')
		const allErrors: Map<string, string[]> = new Map()

		for (const pkg of toPublish) {
			const errors = validatePackageFiles(pkg.path)
			if (errors.length > 0) {
				allErrors.set(pkg.name, errors)
			}
		}

		if (allErrors.size > 0) {
			const errorList = Array.from(allErrors.entries())
				.map(([name, errors]) => `${name}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
				.join('\n\n')
			throw new ValidationError(
				`Package validation failed:\n\n${errorList}`,
				'Did you forget to build? Run your build command before bump publish.'
			)
		}
		consola.success('All packages validated')
	}

	// Setup workspace deps restoration (guaranteed via try/finally)
	let workspaceDepsSnapshot: ReturnType<typeof saveWorkspaceDeps> | null = null
	let allSuccess = true
	const publishedPackages: PackageToProcess[] = []

	// Create temporary .npmrc for authentication
	const npmrcPath = join(cwd, '.npmrc')
	const existingNpmrc = existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf-8') : null

	try {
		// Resolve workspace deps for publish
		if (packages.length > 0 && toPublish.length > 0) {
			workspaceDepsSnapshot = saveWorkspaceDeps(cwd, packages)
			resolveAllWorkspaceDeps(cwd, packages)
			consola.info('Resolved workspace dependencies')
		}

		// Install dependencies to update lockfile
		if (toPublish.length > 0) {
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
		}

		// Setup npm auth
		if (process.env.NPM_TOKEN) {
			writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`)
		}

		// Publish packages
		if (toPublish.length > 0) {
			consola.start('Publishing to npm...')

			for (const pkg of toPublish) {
				consola.info(`  Publishing ${pc.cyan(pkg.name)}@${pc.green(pkg.version)}...`)

				// Use --ignore-scripts: CI must build before bump, not during npm publish
				const publishResult = await $({
					cwd: pkg.path,
				})`npm publish --access public --ignore-scripts`.nothrow()

				if (publishResult.exitCode !== 0) {
					const stderr = publishResult.stderr
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
				consola.success(`  Published ${pc.cyan(pkg.name)}@${pc.green(pkg.version)}`)
			}
		}
	} finally {
		// ALWAYS restore workspace deps, even on failure
		if (workspaceDepsSnapshot) {
			restoreWorkspaceDeps(workspaceDepsSnapshot)
			consola.info('Restored workspace dependencies')
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
	}

	// Create tags and releases only if ALL publishes succeeded
	if (allSuccess && toTag.length > 0) {
		consola.start('Creating tags...')
		for (const pkg of toTag) {
			const existingTag = await $`git tag -l ${pkg.tag}`.nothrow()
			if (!existingTag.stdout.trim()) {
				await $`git tag -a ${pkg.tag} -m "Release ${pkg.tag}"`
				consola.info(`  Created tag ${pc.green(pkg.tag)}`)
			}
		}
		await $`git push --tags`

		// Create GitHub releases
		consola.start('Creating GitHub releases...')
		for (const pkg of toTag) {
			const changelogFile = join(pkg.path, 'CHANGELOG.md')

			if (existsSync(changelogFile)) {
				const changelog = readFileSync(changelogFile, 'utf-8')
				const versionMatch = changelog.match(
					new RegExp(`## ${pkg.version.replace(/\./g, '\\.')}[^#]*`, 's')
				)
				const notes = versionMatch ? versionMatch[0].trim() : ''

				if (notes) {
					await $`echo ${notes} | gh release create ${pkg.tag} --title ${pkg.tag} --notes-file -`
						.quiet()
						.nothrow()
				} else {
					await $`gh release create ${pkg.tag} --title ${pkg.tag} --generate-notes`
						.quiet()
						.nothrow()
				}
			} else {
				await $`gh release create ${pkg.tag} --title ${pkg.tag} --generate-notes`
					.quiet()
					.nothrow()
			}
		}
	}

	if (!allSuccess) {
		throw new PublishError(
			'Publish failed - some packages were not published',
			'Fix the issue and re-run. Already published packages will be skipped.'
		)
	}

	consola.success('Publish completed!')
	return {
		published: publishedPackages.length > 0,
		packages: publishedPackages.map((p) => ({ name: p.name, version: p.version })),
	}
}
