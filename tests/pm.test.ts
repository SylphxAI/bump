import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectPM, getInstallCommand, getInstallCommandCI } from '../src/utils/pm.ts'

const TEST_DIR = '/tmp/bump-pm-test'

describe('pm utils', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
		mkdirSync(TEST_DIR, { recursive: true })
		// Create minimal package.json
		writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'test' }))
	})

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true })
	})

	describe('detectPM', () => {
		it('should detect bun from lock file', () => {
			writeFileSync(join(TEST_DIR, 'bun.lockb'), '')

			expect(detectPM(TEST_DIR)).toBe('bun')
		})

		it('should detect pnpm from lock file', () => {
			writeFileSync(join(TEST_DIR, 'pnpm-lock.yaml'), '')

			expect(detectPM(TEST_DIR)).toBe('pnpm')
		})

		it('should detect yarn from lock file', () => {
			writeFileSync(join(TEST_DIR, 'yarn.lock'), '')

			expect(detectPM(TEST_DIR)).toBe('yarn')
		})

		it('should detect npm from lock file', () => {
			writeFileSync(join(TEST_DIR, 'package-lock.json'), '{}')

			expect(detectPM(TEST_DIR)).toBe('npm')
		})

		it('should prefer packageManager field over lock files', () => {
			writeFileSync(join(TEST_DIR, 'bun.lockb'), '')
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', packageManager: 'pnpm@8.0.0' })
			)

			expect(detectPM(TEST_DIR)).toBe('pnpm')
		})

		it('should detect pnpm from packageManager field', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', packageManager: 'pnpm@9.0.0' })
			)

			expect(detectPM(TEST_DIR)).toBe('pnpm')
		})

		it('should detect yarn from packageManager field', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', packageManager: 'yarn@4.0.0' })
			)

			expect(detectPM(TEST_DIR)).toBe('yarn')
		})

		it('should detect bun from packageManager field', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', packageManager: 'bun@1.0.0' })
			)

			expect(detectPM(TEST_DIR)).toBe('bun')
		})

		it('should detect npm from packageManager field', () => {
			writeFileSync(
				join(TEST_DIR, 'package.json'),
				JSON.stringify({ name: 'test', packageManager: 'npm@10.0.0' })
			)

			expect(detectPM(TEST_DIR)).toBe('npm')
		})

		it('should default to npm when no lock file or packageManager', () => {
			expect(detectPM(TEST_DIR)).toBe('npm')
		})

		it('should prioritize lock files: bun > pnpm > yarn > npm', () => {
			// All lock files present - bun takes priority
			writeFileSync(join(TEST_DIR, 'bun.lockb'), '')
			writeFileSync(join(TEST_DIR, 'pnpm-lock.yaml'), '')
			writeFileSync(join(TEST_DIR, 'yarn.lock'), '')
			writeFileSync(join(TEST_DIR, 'package-lock.json'), '{}')

			expect(detectPM(TEST_DIR)).toBe('bun')

			// Remove bun.lockb
			rmSync(join(TEST_DIR, 'bun.lockb'))
			expect(detectPM(TEST_DIR)).toBe('pnpm')

			// Remove pnpm-lock.yaml
			rmSync(join(TEST_DIR, 'pnpm-lock.yaml'))
			expect(detectPM(TEST_DIR)).toBe('yarn')

			// Remove yarn.lock
			rmSync(join(TEST_DIR, 'yarn.lock'))
			expect(detectPM(TEST_DIR)).toBe('npm')
		})
	})

	describe('getInstallCommand', () => {
		it('should return correct command for bun', () => {
			expect(getInstallCommand('bun')).toEqual(['bun', 'install'])
		})

		it('should return correct command for pnpm', () => {
			expect(getInstallCommand('pnpm')).toEqual(['pnpm', 'install'])
		})

		it('should return correct command for yarn', () => {
			expect(getInstallCommand('yarn')).toEqual(['yarn'])
		})

		it('should return correct command for npm', () => {
			expect(getInstallCommand('npm')).toEqual(['npm', 'install'])
		})
	})

	describe('getInstallCommandCI', () => {
		it('should return frozen lockfile command for bun', () => {
			expect(getInstallCommandCI('bun')).toEqual(['bun', 'install', '--frozen-lockfile'])
		})

		it('should return frozen lockfile command for pnpm', () => {
			expect(getInstallCommandCI('pnpm')).toEqual(['pnpm', 'install', '--frozen-lockfile'])
		})

		it('should return frozen lockfile command for yarn', () => {
			expect(getInstallCommandCI('yarn')).toEqual(['yarn', '--frozen-lockfile'])
		})

		it('should return ci command for npm', () => {
			expect(getInstallCommandCI('npm')).toEqual(['npm', 'ci'])
		})
	})
})
