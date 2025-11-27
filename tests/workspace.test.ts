import { describe, expect, it } from 'bun:test'
import { isWorkspaceDep, resolveWorkspaceDep } from '../src/core/packages.ts'

describe('workspace protocol', () => {
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
})
