import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { BumpConfig, PackageInfo } from '../types.ts'
import { readPackageJson, writePackageJson } from '../utils/fs.ts'

/**
 * Discover packages in a monorepo
 */
export async function discoverPackages(cwd: string, config: BumpConfig): Promise<PackageInfo[]> {
	const packages: PackageInfo[] = []
	const rootPkg = readPackageJson(cwd)

	// Check for workspaces in root package.json
	if (rootPkg?.workspaces) {
		for (const pattern of rootPkg.workspaces) {
			const found = await findPackagesByGlob(cwd, pattern)
			packages.push(...found)
		}
	} else {
		// Check common package directories
		const include = config.packages?.include ?? ['packages/*']
		const exclude = config.packages?.exclude ?? []

		for (const pattern of include) {
			const found = await findPackagesByGlob(cwd, pattern)
			const filtered = found.filter(
				(pkg) => !exclude.some((ex) => pkg.path.includes(ex) || pkg.name.includes(ex))
			)
			packages.push(...filtered)
		}
	}

	return packages
}

/**
 * Find packages matching a glob pattern
 */
async function findPackagesByGlob(cwd: string, pattern: string): Promise<PackageInfo[]> {
	const packages: PackageInfo[] = []

	// Simple glob handling for common patterns like "packages/*"
	if (pattern.endsWith('/*')) {
		const baseDir = join(cwd, pattern.slice(0, -2))
		try {
			const entries = readdirSync(baseDir)
			for (const entry of entries) {
				const pkgDir = join(baseDir, entry)
				if (!statSync(pkgDir).isDirectory()) continue

				const pkg = readPackageJson(pkgDir)
				if (pkg?.name && pkg?.version) {
					packages.push({
						name: pkg.name,
						version: pkg.version,
						path: pkgDir,
						private: pkg.private ?? false,
						dependencies: pkg.dependencies,
						devDependencies: pkg.devDependencies,
						peerDependencies: pkg.peerDependencies,
					})
				}
			}
		} catch {
			// Directory doesn't exist
		}
	}

	return packages
}

/**
 * Get single package info (for non-monorepo)
 */
export function getSinglePackage(cwd: string): PackageInfo | null {
	const pkg = readPackageJson(cwd)
	if (!pkg?.name || !pkg?.version) return null

	return {
		name: pkg.name,
		version: pkg.version,
		path: cwd,
		private: pkg.private ?? false,
		dependencies: pkg.dependencies,
		devDependencies: pkg.devDependencies,
		peerDependencies: pkg.peerDependencies,
	}
}

/**
 * Update package version
 */
export function updatePackageVersion(packagePath: string, newVersion: string): void {
	const pkg = readPackageJson(packagePath)
	if (!pkg) throw new Error(`No package.json found at ${packagePath}`)

	pkg.version = newVersion
	writePackageJson(packagePath, pkg)
}

/**
 * Update dependency versions in packages
 */
export function updateDependencyVersions(
	cwd: string,
	packages: PackageInfo[],
	updates: Map<string, string>
): void {
	const allPackages = [readPackageJson(cwd), ...packages.map((p) => readPackageJson(p.path))]
	const allPaths = [cwd, ...packages.map((p) => p.path)]

	for (let i = 0; i < allPackages.length; i++) {
		const pkg = allPackages[i]
		const pkgPath = allPaths[i]
		if (!pkg || !pkgPath) continue

		let updated = false

		for (const [name, version] of updates) {
			// Update dependencies
			if (pkg.dependencies?.[name]) {
				pkg.dependencies[name] = `^${version}`
				updated = true
			}
			if (pkg.devDependencies?.[name]) {
				pkg.devDependencies[name] = `^${version}`
				updated = true
			}
			if (pkg.peerDependencies?.[name]) {
				pkg.peerDependencies[name] = `^${version}`
				updated = true
			}
		}

		if (updated) {
			writePackageJson(pkgPath, pkg)
		}
	}
}

/**
 * Check if project is a monorepo
 */
export function isMonorepo(cwd: string): boolean {
	const pkg = readPackageJson(cwd)

	// Has workspaces field
	if (pkg?.workspaces && Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
		return true
	}

	// Has packages/ directory with package.json files
	const packagesDir = join(cwd, 'packages')
	try {
		const entries = readdirSync(packagesDir)
		for (const entry of entries) {
			const pkgPath = join(packagesDir, entry, 'package.json')
			try {
				statSync(pkgPath)
				return true
			} catch {}
		}
	} catch {
		// packages/ doesn't exist
	}

	return false
}

/**
 * Find packages that depend on the given package names
 * Checks dependencies and devDependencies (not peerDependencies)
 */
export function findDependentPackages(
	packages: PackageInfo[],
	targetNames: Set<string>
): PackageInfo[] {
	const dependents: PackageInfo[] = []

	for (const pkg of packages) {
		// Skip if already in target set
		if (targetNames.has(pkg.name)) continue

		const allDeps = {
			...pkg.dependencies,
			...pkg.devDependencies,
		}

		// Check if any dependency is in the target set
		for (const depName of Object.keys(allDeps)) {
			if (targetNames.has(depName)) {
				dependents.push(pkg)
				break
			}
		}
	}

	return dependents
}

/**
 * Calculate cascade bumps for dependent packages
 * Returns packages that need to be bumped due to dependency updates
 */
export function calculateCascadeBumps(
	packages: PackageInfo[],
	bumpedNames: Set<string>
): PackageInfo[] {
	const allBumped = new Set(bumpedNames)
	const cascadeBumps: PackageInfo[] = []

	// Keep finding dependents until no new ones are found
	let newDependents = findDependentPackages(packages, allBumped)

	while (newDependents.length > 0) {
		for (const pkg of newDependents) {
			cascadeBumps.push(pkg)
			allBumped.add(pkg.name)
		}
		newDependents = findDependentPackages(packages, allBumped)
	}

	return cascadeBumps
}
