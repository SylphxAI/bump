import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	readPackageJson,
	writePackageJson,
	fileExists,
	readFile,
	writeFile,
} from '../src/utils/fs.ts'

const TEST_DIR = '/tmp/bump-fs-test'

describe('fs utils', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
		mkdirSync(TEST_DIR, { recursive: true })
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('readPackageJson', () => {
		it('should read valid package.json', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
			)

			const pkg = readPackageJson(TEST_DIR)

			expect(pkg?.name).toBe('test-pkg')
			expect(pkg?.version).toBe('1.0.0')
		})

		it('should return null for non-existent package.json', () => {
			const pkg = readPackageJson(TEST_DIR)

			expect(pkg).toBe(null)
		})

		it('should return null for invalid JSON', () => {
			writeFileSync(join(TEST_DIR, 'package.json'), '{ invalid json }')

			const pkg = readPackageJson(TEST_DIR)

			expect(pkg).toBe(null)
		})

		it('should read all package.json fields', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({
					name: '@scope/test',
					version: '2.0.0',
					private: true,
					workspaces: ['packages/*'],
					dependencies: { dep1: '^1.0.0' },
					devDependencies: { dev1: '^2.0.0' },
					peerDependencies: { peer1: '^3.0.0' },
				})
			)

			const pkg = readPackageJson(TEST_DIR)

			expect(pkg?.name).toBe('@scope/test')
			expect(pkg?.version).toBe('2.0.0')
			expect(pkg?.private).toBe(true)
			expect(pkg?.workspaces).toEqual(['packages/*'])
			expect(pkg?.dependencies?.dep1).toBe('^1.0.0')
			expect(pkg?.devDependencies?.dev1).toBe('^2.0.0')
			expect(pkg?.peerDependencies?.peer1).toBe('^3.0.0')
		})
	})

	describe('writePackageJson', () => {
		it('should write package.json with proper formatting', () => {
			const pkg = { name: 'test-pkg', version: '1.0.0' }

			writePackageJson(TEST_DIR, pkg)

			const content = readFileSync(join(TEST_DIR, 'package.json'), 'utf-8')
			expect(content).toContain('"name": "test-pkg"')
			expect(content).toContain('"version": "1.0.0"')
			expect(content).toContain('\t') // Tab indentation
			expect(content.endsWith('\n')).toBe(true) // Trailing newline
		})

		it('should overwrite existing package.json', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'old', version: '0.0.1' })
			)

			writePackageJson(TEST_DIR, { name: 'new', version: '1.0.0' })

			const pkg = readPackageJson(TEST_DIR)
			expect(pkg?.name).toBe('new')
			expect(pkg?.version).toBe('1.0.0')
		})
	})

	describe('fileExists', () => {
		it('should return true for existing file', () => {
			writeFileSync(join(TEST_DIR, 'test.txt'), 'hello')

			expect(fileExists(join(TEST_DIR, 'test.txt'))).toBe(true)
		})

		it('should return false for non-existent file', () => {
			expect(fileExists(join(TEST_DIR, 'nonexistent.txt'))).toBe(false)
		})

		it('should return true for directory', () => {
			mkdirSync(join(TEST_DIR, 'subdir'))

			expect(fileExists(join(TEST_DIR, 'subdir'))).toBe(true)
		})
	})

	describe('readFile', () => {
		it('should read file content', () => {
			writeFileSync(join(TEST_DIR, 'test.txt'), 'hello world')

			const content = readFile(join(TEST_DIR, 'test.txt'))

			expect(content).toBe('hello world')
		})

		it('should return null for non-existent file', () => {
			const content = readFile(join(TEST_DIR, 'nonexistent.txt'))

			expect(content).toBe(null)
		})

		it('should read UTF-8 content correctly', () => {
			writeFileSync(join(TEST_DIR, 'unicode.txt'), '你好世界 🌍')

			const content = readFile(join(TEST_DIR, 'unicode.txt'))

			expect(content).toBe('你好世界 🌍')
		})
	})

	describe('writeFile', () => {
		it('should write file content', () => {
			writeFile(join(TEST_DIR, 'test.txt'), 'hello world')

			const content = readFileSync(join(TEST_DIR, 'test.txt'), 'utf-8')
			expect(content).toBe('hello world')
		})

		it('should overwrite existing file', () => {
			writeFileSync(join(TEST_DIR, 'test.txt'), 'old content')

			writeFile(join(TEST_DIR, 'test.txt'), 'new content')

			const content = readFileSync(join(TEST_DIR, 'test.txt'), 'utf-8')
			expect(content).toBe('new content')
		})

		it('should write UTF-8 content correctly', () => {
			writeFile(join(TEST_DIR, 'unicode.txt'), '你好世界 🌍')

			const content = readFileSync(join(TEST_DIR, 'unicode.txt'), 'utf-8')
			expect(content).toBe('你好世界 🌍')
		})
	})
})
