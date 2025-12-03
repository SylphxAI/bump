/**
 * Base error class for bump errors
 */
export class BumpError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly suggestion?: string
	) {
		super(message)
		this.name = 'BumpError'
	}
}

/**
 * Git-related errors
 */
export class GitError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'GIT_ERROR', suggestion)
		this.name = 'GitError'
	}
}

/**
 * Configuration errors
 */
export class ConfigError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'CONFIG_ERROR', suggestion)
		this.name = 'ConfigError'
	}
}

/**
 * Package-related errors
 */
export class PackageError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'PACKAGE_ERROR', suggestion)
		this.name = 'PackageError'
	}
}

/**
 * GitHub API errors
 */
export class GitHubError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'GITHUB_ERROR', suggestion)
		this.name = 'GitHubError'
	}
}

/**
 * Publishing errors
 */
export class PublishError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'PUBLISH_ERROR', suggestion)
		this.name = 'PublishError'
	}
}

/**
 * Validation errors (invalid input, missing requirements)
 */
export class ValidationError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'VALIDATION_ERROR', suggestion)
		this.name = 'ValidationError'
	}
}

/**
 * CI environment errors
 */
export class CIError extends BumpError {
	constructor(message: string, suggestion?: string) {
		super(message, 'CI_ERROR', suggestion)
		this.name = 'CIError'
	}
}

/**
 * Format error message with suggestion
 */
export function formatError(error: unknown): string {
	if (error instanceof BumpError) {
		let message = `[${error.code}] ${error.message}`
		if (error.suggestion) {
			message += `\n\n💡 ${error.suggestion}`
		}
		return message
	}

	if (error instanceof Error) {
		return error.message
	}

	return String(error)
}
