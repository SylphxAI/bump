import { $ } from 'zx'

// Configure zx
$.quiet = true

/**
 * Get the latest published version of a package from npm registry
 * Returns null if package is not published or not found
 */
export async function getNpmPublishedVersion(packageName: string): Promise<string | null> {
	try {
		const result = await $`npm view ${packageName} version`
		const version = result.stdout.trim()
		// Validate it looks like a version
		if (/^\d+\.\d+\.\d+/.test(version)) {
			return version
		}
		return null
	} catch {
		// Package not found or not published
		return null
	}
}

/**
 * Get all published versions of a package from npm registry
 * Returns empty array if package is not published
 */
export async function getNpmPublishedVersions(packageName: string): Promise<string[]> {
	try {
		const result = await $`npm view ${packageName} versions --json`
		const versions = JSON.parse(result.stdout)
		if (Array.isArray(versions)) {
			return versions
		}
		// Single version returns as string, not array
		if (typeof versions === 'string') {
			return [versions]
		}
		return []
	} catch {
		return []
	}
}

/**
 * Check if a package is published on npm
 */
export async function isPackagePublished(packageName: string): Promise<boolean> {
	const version = await getNpmPublishedVersion(packageName)
	return version !== null
}
