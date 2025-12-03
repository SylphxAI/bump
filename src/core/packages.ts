import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { BumpConfig, PackageInfo } from '../types.ts'
import { readPackageJson, writePackageJson } from '../utils/fs.ts'

/** Dependency types to process for workspace resolution */
const DEP_TYPES = ['dependencies', 'devDependencies', 'peerDependencies'] as const
type DepType = (typeof DEP_TYPES)[number]

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
 * Check if a dependency value uses workspace protocol
 */
export function isWorkspaceDep(value: string): boolean {
	return value.startsWith('workspace:')
}

/**
 * Resolve workspace protocol to actual version
 * Preserves the intent: workspace:^ → ^x.x.x, workspace:~ → ~x.x.x
 *
 * Supported formats:
 * - workspace:* → ^version (most common, means "any version")
 * - workspace:^ → ^version
 * - workspace:~ → ~version
 * - workspace:^1.0.0 → ^1.0.0 (keeps explicit range)
 * - workspace:~1.0.0 → ~1.0.0
 * - workspace:1.0.0 → 1.0.0 (exact)
 */
export function resolveWorkspaceDep(value: string, version: string): string {
	if (!isWorkspaceDep(value)) return value

	const specifier = value.slice('workspace:'.length)

	switch (specifier) {
		case '*':
		case '^':
			return `^${version}`
		case '~':
			return `~${version}`
		default:
			// workspace:^1.0.0, workspace:~1.0.0, workspace:1.0.0
			// Keep the explicit range as-is
			return specifier
	}
}

/** Saved workspace deps: path -> depType -> depName -> originalValue */
export type WorkspaceDepsSnapshot = Map<string, Map<string, Map<string, string>>>

/**
 * Save all workspace: dependencies before resolution
 * Returns a snapshot that can be used to restore them later
 */
export function saveWorkspaceDeps(cwd: string, packages: PackageInfo[]): WorkspaceDepsSnapshot {
	const snapshot: WorkspaceDepsSnapshot = new Map()

	const allPaths = [cwd, ...packages.map((p) => p.path)]

	for (const pkgPath of allPaths) {
		const pkg = readPackageJson(pkgPath)
		if (!pkg) continue

		const pkgSnapshot = new Map<string, Map<string, string>>()

		for (const depType of DEP_TYPES) {
			const deps = pkg[depType]
			if (!deps) continue

			const depTypeSnapshot = new Map<string, string>()
			for (const [name, version] of Object.entries(deps)) {
				if (isWorkspaceDep(version)) {
					depTypeSnapshot.set(name, version)
				}
			}

			if (depTypeSnapshot.size > 0) {
				pkgSnapshot.set(depType, depTypeSnapshot)
			}
		}

		if (pkgSnapshot.size > 0) {
			snapshot.set(pkgPath, pkgSnapshot)
		}
	}

	return snapshot
}

/**
 * Restore workspace: dependencies from a snapshot
 * Call this after publish to restore workspace:* values before committing
 */
export function restoreWorkspaceDeps(snapshot: WorkspaceDepsSnapshot): void {
	for (const [pkgPath, pkgSnapshot] of snapshot) {
		const pkg = readPackageJson(pkgPath)
		if (!pkg) continue

		for (const [depType, depTypeSnapshot] of pkgSnapshot) {
			const deps = pkg[depType as DepType]
			if (!deps) continue

			for (const [name, originalValue] of depTypeSnapshot) {
				deps[name] = originalValue
			}
		}

		writePackageJson(pkgPath, pkg)
	}
}

/**
 * Update workspace dependencies in a deps object
 * Returns true if any changes were made
 */
function updateWorkspaceDeps(
	deps: Record<string, string> | undefined,
	updates: Map<string, string>
): boolean {
	if (!deps) return false

	let changed = false
	for (const [name, version] of updates) {
		const current = deps[name]
		if (current && isWorkspaceDep(current)) {
			deps[name] = resolveWorkspaceDep(current, version)
			changed = true
		}
	}
	return changed
}

/**
 * Resolve all workspace:* dependencies to actual versions
 * Only updates dependencies that use workspace: protocol
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
		for (const depType of DEP_TYPES) {
			if (updateWorkspaceDeps(pkg[depType], updates)) {
				updated = true
			}
		}

		if (updated) {
			writePackageJson(pkgPath, pkg)
		}
	}
}

/**
 * Resolve ALL workspace dependencies in packages (not just bumped ones)
 * Use this before publish to ensure all workspace: refs are resolved
 */
export function resolveAllWorkspaceDeps(cwd: string, packages: PackageInfo[]): void {
	// Build version map from all packages
	const versionMap = new Map<string, string>()
	for (const pkg of packages) {
		versionMap.set(pkg.name, pkg.version)
	}

	// Also check root package
	const rootPkg = readPackageJson(cwd)
	if (rootPkg?.name && rootPkg?.version) {
		versionMap.set(rootPkg.name, rootPkg.version)
	}

	updateDependencyVersions(cwd, packages, versionMap)
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
 * Automatically filters out private packages
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
			// Skip private packages - they should never be released
			if (pkg.private) {
				allBumped.add(pkg.name) // Still track to find their dependents
				continue
			}
			cascadeBumps.push(pkg)
			allBumped.add(pkg.name)
		}
		newDependents = findDependentPackages(packages, allBumped)
	}

	return cascadeBumps
}
