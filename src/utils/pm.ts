import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'zx'
import { readPackageJson } from './fs.ts'

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

/**
 * Detect package manager from packageManager field or lock files
 */
export function detectPM(cwd: string = process.cwd()): PackageManager {
	// 1. Explicit packageManager field (Corepack standard)
	const pkg = readPackageJson(cwd)
	if (pkg?.packageManager) {
		const pm = pkg.packageManager as string
		if (pm.startsWith('pnpm')) return 'pnpm'
		if (pm.startsWith('yarn')) return 'yarn'
		if (pm.startsWith('bun')) return 'bun'
		if (pm.startsWith('npm')) return 'npm'
	}

	// 2. Lock files
	if (existsSync(join(cwd, 'bun.lockb'))) return 'bun'
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
	if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
	if (existsSync(join(cwd, 'package-lock.json'))) return 'npm'

	// 3. Default to npm (most universal)
	return 'npm'
}

/**
 * Get install command for package manager
 */
export function getInstallCommand(pm: PackageManager): string[] {
	switch (pm) {
		case 'bun':
			return ['bun', 'install']
		case 'pnpm':
			return ['pnpm', 'install']
		case 'yarn':
			return ['yarn']
		default:
			return ['npm', 'install']
	}
}

/**
 * Get install command with frozen lockfile for CI
 */
export function getInstallCommandCI(pm: PackageManager): string[] {
	switch (pm) {
		case 'bun':
			return ['bun', 'install', '--frozen-lockfile']
		case 'pnpm':
			return ['pnpm', 'install', '--frozen-lockfile']
		case 'yarn':
			return ['yarn', '--frozen-lockfile']
		default:
			return ['npm', 'ci']
	}
}

/**
 * Run install with detected package manager
 * Tries frozen lockfile first (CI mode), falls back to regular install
 */
export async function runInstall(cwd: string): Promise<{ success: boolean; pm: PackageManager }> {
	const pm = detectPM(cwd)

	// Configure zx
	$.cwd = cwd
	$.quiet = true

	// Try frozen lockfile first
	const ciCmd = getInstallCommandCI(pm)
	try {
		await $`${ciCmd}`
		return { success: true, pm }
	} catch {
		// Fall back to regular install
		const cmd = getInstallCommand(pm)
		try {
			await $`${cmd}`
			return { success: true, pm }
		} catch {
			return { success: false, pm }
		}
	}
}

/**
 * Run npm publish (universal across all PMs)
 * All package managers can publish via npm
 */
export async function runPublish(
	cwd: string,
	options: { access?: 'public' | 'restricted' } = {}
): Promise<{ success: boolean; error?: string }> {
	$.cwd = cwd
	$.quiet = true

	const args = ['publish']
	if (options.access) {
		args.push('--access', options.access)
	}

	// Set NPM_TOKEN if available
	const env = process.env.NPM_TOKEN ? { NPM_CONFIG_TOKEN: process.env.NPM_TOKEN } : {}

	try {
		await $({ env })`npm ${args}`
		return { success: true }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}
