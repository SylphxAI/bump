import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PackageJson {
	name?: string
	version?: string
	private?: boolean
	workspaces?: string[]
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}

export function readPackageJson(dir: string): PackageJson | null {
	const pkgPath = join(dir, 'package.json')
	if (!existsSync(pkgPath)) return null
	try {
		return JSON.parse(readFileSync(pkgPath, 'utf-8'))
	} catch {
		return null
	}
}

export function writePackageJson(dir: string, pkg: PackageJson): void {
	const pkgPath = join(dir, 'package.json')
	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`, 'utf-8')
}

export function fileExists(path: string): boolean {
	return existsSync(path)
}

export function readFile(path: string): string | null {
	if (!existsSync(path)) return null
	return readFileSync(path, 'utf-8')
}

export function writeFile(path: string, content: string): void {
	writeFileSync(path, content, 'utf-8')
}
