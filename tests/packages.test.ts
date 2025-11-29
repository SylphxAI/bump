import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	calculateCascadeBumps,
	discoverPackages,
	findDependentPackages,
	getSinglePackage,
	isMonorepo,
	isWorkspaceDep,
	resolveAllWorkspaceDeps,
	resolveWorkspaceDep,
	updateDependencyVersions,
	updatePackageVersion,
} from '../src/core/packages.ts'
import type { PackageInfo } from '../src/types.ts'

const TEST_DIR = '/tmp/bump-packages-test'

describe('packages', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
		mkdirSync(TEST_DIR, { recursive: true })
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('isWorkspaceDep', () => {
		it('should detect workspace protocol', () => {
			expect(isWorkspaceDep('workspace:*')).toBe(true)
			expect(isWorkspaceDep('workspace:^')).toBe(true)
			expect(isWorkspaceDep('workspace:~')).toBe(true)
			expect(isWorkspaceDep('workspace:^1.0.0')).toBe(true)
		})

		it('should not detect non-workspace deps', () => {
			expect(isWorkspaceDep('^1.0.0')).toBe(false)
			expect(isWorkspaceDep('~1.0.0')).toBe(false)
			expect(isWorkspaceDep('1.0.0')).toBe(false)
			expect(isWorkspaceDep('latest')).toBe(false)
		})
	})

	describe('resolveWorkspaceDep', () => {
		it('should resolve workspace:* to ^version', () => {
			expect(resolveWorkspaceDep('workspace:*', '2.0.0')).toBe('^2.0.0')
		})

		it('should resolve workspace:^ to ^version', () => {
			expect(resolveWorkspaceDep('workspace:^', '2.0.0')).toBe('^2.0.0')
		})

		it('should resolve workspace:~ to ~version', () => {
			expect(resolveWorkspaceDep('workspace:~', '2.0.0')).toBe('~2.0.0')
		})

		it('should preserve explicit ranges', () => {
			expect(resolveWorkspaceDep('workspace:^1.0.0', '2.0.0')).toBe('^1.0.0')
			expect(resolveWorkspaceDep('workspace:~1.0.0', '2.0.0')).toBe('~1.0.0')
			expect(resolveWorkspaceDep('workspace:1.0.0', '2.0.0')).toBe('1.0.0')
		})

		it('should not modify non-workspace deps', () => {
			expect(resolveWorkspaceDep('^1.0.0', '2.0.0')).toBe('^1.0.0')
			expect(resolveWorkspaceDep('~1.0.0', '2.0.0')).toBe('~1.0.0')
			expect(resolveWorkspaceDep('1.0.0', '2.0.0')).toBe('1.0.0')
		})
	})

	describe('getSinglePackage', () => {
		it('should return package info', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({
					name: 'test-pkg',
					version: '1.0.0',
					dependencies: { dep1: '^1.0.0' },
					devDependencies: { dev1: '^2.0.0' },
				})
			)

			const pkg = getSinglePackage(TEST_DIR)

			expect(pkg?.name).toBe('test-pkg')
			expect(pkg?.version).toBe('1.0.0')
			expect(pkg?.path).toBe(TEST_DIR)
			expect(pkg?.private).toBe(false)
			expect(pkg?.dependencies?.dep1).toBe('^1.0.0')
			expect(pkg?.devDependencies?.dev1).toBe('^2.0.0')
		})

		it('should return null if no package.json', () => {
			const pkg = getSinglePackage(TEST_DIR)

			expect(pkg).toBe(null)
		})

		it('should return null if package.json has no name', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ version: '1.0.0' }))

			const pkg = getSinglePackage(TEST_DIR)

			expect(pkg).toBe(null)
		})

		it('should return null if package.json has no version', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'test' }))

			const pkg = getSinglePackage(TEST_DIR)

			expect(pkg).toBe(null)
		})

		it('should detect private package', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0', private: true })
			)

			const pkg = getSinglePackage(TEST_DIR)

			expect(pkg?.private).toBe(true)
		})
	})

	describe('updatePackageVersion', () => {
		it('should update version in package.json', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', version: '1.0.0' })
			)

			updatePackageVersion(TEST_DIR, '2.0.0')

			const pkg = JSON.parse(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8'))
			expect(pkg.version).toBe('2.0.0')
		})

		it('should throw if no package.json', () => {
			expect(() => updatePackageVersion(TEST_DIR, '2.0.0')).toThrow()
		})

		it('should preserve other fields', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({
					name: 'test',
					version: '1.0.0',
					description: 'A test package',
					dependencies: { dep: '^1.0.0' },
				})
			)

			updatePackageVersion(TEST_DIR, '2.0.0')

			const pkg = JSON.parse(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8'))
			expect(pkg.name).toBe('test')
			expect(pkg.description).toBe('A test package')
			expect(pkg.dependencies.dep).toBe('^1.0.0')
		})
	})

	describe('isMonorepo', () => {
		it('should detect monorepo with workspaces field', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))

			expect(isMonorepo(TEST_DIR)).toBe(true)
		})

		it('should detect monorepo with packages directory', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({}))
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: 'foo' })
			)

			expect(isMonorepo(TEST_DIR)).toBe(true)
		})

		it('should return false for single package', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'single-pkg' }))

			expect(isMonorepo(TEST_DIR)).toBe(false)
		})

		it('should return false for empty workspaces array', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ workspaces: [] }))

			expect(isMonorepo(TEST_DIR)).toBe(false)
		})

		it('should return false when packages dir exists but has no packages', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({}))
			mkdirSync(join(TEST_DIR, 'packages'), { recursive: true })

			expect(isMonorepo(TEST_DIR)).toBe(false)
		})
	})

	describe('findDependentPackages', () => {
		it('should find packages that depend on target', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{
					name: '@scope/utils',
					version: '1.0.0',
					path: '/utils',
					private: false,
					dependencies: { '@scope/core': '^1.0.0' },
				},
				{
					name: '@scope/cli',
					version: '1.0.0',
					path: '/cli',
					private: false,
					devDependencies: { '@scope/core': '^1.0.0' },
				},
				{ name: '@scope/other', version: '1.0.0', path: '/other', private: false },
			]

			const dependents = findDependentPackages(packages, new Set(['@scope/core']))

			expect(dependents.map((p) => p.name)).toEqual(['@scope/utils', '@scope/cli'])
		})

		it('should not include packages already in target set', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{
					name: '@scope/utils',
					version: '1.0.0',
					path: '/utils',
					private: false,
					dependencies: { '@scope/core': '^1.0.0' },
				},
			]

			const dependents = findDependentPackages(packages, new Set(['@scope/core', '@scope/utils']))

			expect(dependents).toEqual([])
		})

		it('should return empty array when no dependents', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{ name: '@scope/utils', version: '1.0.0', path: '/utils', private: false },
			]

			const dependents = findDependentPackages(packages, new Set(['@scope/core']))

			expect(dependents).toEqual([])
		})
	})

	describe('calculateCascadeBumps', () => {
		it('should cascade bumps through dependency chain', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{
					name: '@scope/utils',
					version: '1.0.0',
					path: '/utils',
					private: false,
					dependencies: { '@scope/core': '^1.0.0' },
				},
				{
					name: '@scope/cli',
					version: '1.0.0',
					path: '/cli',
					private: false,
					dependencies: { '@scope/utils': '^1.0.0' },
				},
			]

			const cascade = calculateCascadeBumps(packages, new Set(['@scope/core']))

			// Both utils and cli should be bumped
			expect(cascade.map((p) => p.name).sort()).toEqual(['@scope/cli', '@scope/utils'])
		})

		it('should return empty array when no cascade needed', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{ name: '@scope/utils', version: '1.0.0', path: '/utils', private: false },
			]

			const cascade = calculateCascadeBumps(packages, new Set(['@scope/core']))

			expect(cascade).toEqual([])
		})

		it('should skip private packages in cascade bumps', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{
					name: '@scope/utils',
					version: '1.0.0',
					path: '/utils',
					private: false,
					dependencies: { '@scope/core': '^1.0.0' },
				},
				{
					name: 'private-example',
					version: '1.0.0',
					path: '/examples/private',
					private: true, // Should be skipped
					dependencies: { '@scope/core': '^1.0.0' },
				},
			]

			const cascade = calculateCascadeBumps(packages, new Set(['@scope/core']))

			// Only utils should be bumped, not private-example
			expect(cascade.map((p) => p.name)).toEqual(['@scope/utils'])
		})

		it('should still find dependents of private packages', () => {
			const packages: PackageInfo[] = [
				{ name: '@scope/core', version: '1.0.0', path: '/core', private: false },
				{
					name: 'private-middle',
					version: '1.0.0',
					path: '/private',
					private: true, // Private but has dependents
					dependencies: { '@scope/core': '^1.0.0' },
				},
				{
					name: '@scope/app',
					version: '1.0.0',
					path: '/app',
					private: false,
					dependencies: { 'private-middle': '^1.0.0' },
				},
			]

			const cascade = calculateCascadeBumps(packages, new Set(['@scope/core']))

			// app depends on private-middle which depends on core
			// private-middle should be tracked but not included in result
			// app should be included because it depends on private-middle
			expect(cascade.map((p) => p.name)).toEqual(['@scope/app'])
		})
	})

	describe('discoverPackages', () => {
		it('should discover packages from workspaces field', async () => {
			// Setup monorepo structure
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			mkdirSync(join(TEST_DIR, 'packages', 'bar'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: '@scope/foo', version: '1.0.0' })
			)
			writeFileSync(
				join(TEST_DIR, 'packages', 'bar', 'package.json'),
				JSON.stringify({ name: '@scope/bar', version: '2.0.0' })
			)

			const packages = await discoverPackages(TEST_DIR, {})

			expect(packages.length).toBe(2)
			expect(packages.map((p) => p.name).sort()).toEqual(['@scope/bar', '@scope/foo'])
		})

		it('should use default packages/* pattern when no workspaces', async () => {
			// Setup without workspaces field
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({}))
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: 'foo', version: '1.0.0' })
			)

			const packages = await discoverPackages(TEST_DIR, {})

			expect(packages.length).toBe(1)
			expect(packages[0]?.name).toBe('foo')
		})

		it('should skip directories without package.json', async () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			mkdirSync(join(TEST_DIR, 'packages', 'bar'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: '@scope/foo', version: '1.0.0' })
			)
			// bar has no package.json

			const packages = await discoverPackages(TEST_DIR, {})

			expect(packages.length).toBe(1)
			expect(packages[0]?.name).toBe('@scope/foo')
		})

		it('should skip packages without name or version', async () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			mkdirSync(join(TEST_DIR, 'packages', 'bar'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: '@scope/foo', version: '1.0.0' })
			)
			writeFileSync(
				join(TEST_DIR, 'packages', 'bar', 'package.json'),
				JSON.stringify({ name: '@scope/bar' }) // No version
			)

			const packages = await discoverPackages(TEST_DIR, {})

			expect(packages.length).toBe(1)
		})

		it('should apply exclude filter from config', async () => {
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({}))
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			mkdirSync(join(TEST_DIR, 'packages', 'bar'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: 'foo', version: '1.0.0' })
			)
			writeFileSync(
				join(TEST_DIR, 'packages', 'bar', 'package.json'),
				JSON.stringify({ name: 'bar', version: '1.0.0' })
			)

			const packages = await discoverPackages(TEST_DIR, {
				packages: { exclude: ['bar'] },
			})

			expect(packages.length).toBe(1)
			expect(packages[0]?.name).toBe('foo')
		})
	})

	describe('updateDependencyVersions', () => {
		it('should update workspace dependencies', () => {
			// Setup
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({
					name: 'root',
					dependencies: { '@scope/foo': 'workspace:^' },
				})
			)

			updateDependencyVersions(TEST_DIR, [], new Map([['@scope/foo', '2.0.0']]))

			const pkg = JSON.parse(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8'))
			expect(pkg.dependencies['@scope/foo']).toBe('^2.0.0')
		})

		it('should update dependencies in subpackages', () => {
			// Setup root
			writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'root' }))

			// Setup subpackage
			mkdirSync(join(TEST_DIR, 'packages', 'bar'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'bar', 'package.json'),
				JSON.stringify({
					name: '@scope/bar',
					version: '1.0.0',
					dependencies: { '@scope/foo': 'workspace:*' },
				})
			)

			const packages: PackageInfo[] = [
				{
					name: '@scope/bar',
					version: '1.0.0',
					path: join(TEST_DIR, 'packages', 'bar'),
					private: false,
				},
			]

			updateDependencyVersions(TEST_DIR, packages, new Map([['@scope/foo', '2.0.0']]))

			const pkg = JSON.parse(
				readFileSync(join(TEST_DIR, 'packages', 'bar', 'package.json'), 'utf-8')
			)
			expect(pkg.dependencies['@scope/foo']).toBe('^2.0.0')
		})

		it('should not modify non-workspace deps', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({
					name: 'root',
					dependencies: { lodash: '^4.0.0' },
				})
			)

			updateDependencyVersions(TEST_DIR, [], new Map([['lodash', '5.0.0']]))

			const pkg = JSON.parse(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8'))
			expect(pkg.dependencies.lodash).toBe('^4.0.0')
		})
	})

	describe('resolveAllWorkspaceDeps', () => {
		it('should resolve all workspace dependencies', () => {
			// Setup root
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({
					name: 'root',
					version: '1.0.0',
				})
			)

			// Setup packages
			mkdirSync(join(TEST_DIR, 'packages', 'foo'), { recursive: true })
			mkdirSync(join(TEST_DIR, 'packages', 'bar'), { recursive: true })
			writeFileSync(
				join(TEST_DIR, 'packages', 'foo', 'package.json'),
				JSON.stringify({ name: '@scope/foo', version: '2.0.0' })
			)
			writeFileSync(
				join(TEST_DIR, 'packages', 'bar', 'package.json'),
				JSON.stringify({
					name: '@scope/bar',
					version: '1.0.0',
					dependencies: { '@scope/foo': 'workspace:^' },
				})
			)

			const packages: PackageInfo[] = [
				{
					name: '@scope/foo',
					version: '2.0.0',
					path: join(TEST_DIR, 'packages', 'foo'),
					private: false,
				},
				{
					name: '@scope/bar',
					version: '1.0.0',
					path: join(TEST_DIR, 'packages', 'bar'),
					private: false,
				},
			]

			resolveAllWorkspaceDeps(TEST_DIR, packages)

			const barPkg = JSON.parse(
				readFileSync(join(TEST_DIR, 'packages', 'bar', 'package.json'), 'utf-8')
			)
			expect(barPkg.dependencies['@scope/foo']).toBe('^2.0.0')
		})
	})
})
