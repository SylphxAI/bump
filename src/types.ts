export type ReleaseType =
	| 'major'
	| 'minor'
	| 'patch'
	| 'premajor'
	| 'preminor'
	| 'prepatch'
	| 'prerelease'
	| 'initial'
	| 'manual' // Local > npm: already bumped (from merged PR), just publish

export type VersionStrategy = 'independent' | 'fixed' | 'synced'

export interface BumpConfig {
	/** Version strategy for monorepo */
	versioning?: VersionStrategy

	/**
	 * Pre-release identifier (alpha, beta, rc)
	 * @deprecated Use bump files instead: .bump/*.md with `prerelease: beta`
	 */
	prerelease?: string | false

	/** Graduate from 0.x to 1.0.0 (stable release) */
	graduate?: boolean

	/** Conventional commits configuration */
	conventional?: {
		/** Preset to use */
		preset?: 'angular' | 'conventional' | 'atom'
		/** Custom types mapping to release type */
		types?: Record<string, ReleaseType | null>
	}

	/** Changelog configuration */
	changelog?: {
		/** Changelog format */
		format?: 'github' | 'keep-a-changelog' | 'conventional'
		/** Include commit messages in changelog */
		includeCommits?: boolean
		/** Group commits by type */
		groupBy?: 'type' | 'scope' | 'none'
		/** Changelog file path */
		file?: string
	}

	/** Publishing configuration */
	publish?: {
		/** npm registry URL */
		registry?: string
		/** Package access level */
		access?: 'public' | 'restricted'
		/** npm dist-tag */
		tag?: string
	}

	/** GitHub configuration */
	github?: {
		/** Create GitHub release */
		release?: boolean
		/** Release name template */
		releaseName?: string
		/** Create as draft */
		draft?: boolean
	}

	/** Lifecycle hooks */
	hooks?: {
		preVersion?: () => Promise<void> | void
		postVersion?: () => Promise<void> | void
		prePublish?: () => Promise<void> | void
		postPublish?: () => Promise<void> | void
	}

	/** Monorepo packages configuration */
	packages?: {
		/** Glob patterns to include */
		include?: string[]
		/** Glob patterns to exclude */
		exclude?: string[]
		/** How to handle dependency updates */
		dependencyUpdates?: 'auto' | 'prompt' | 'none'
	}

	/** Base branch for comparison */
	baseBranch?: string
}

export interface ConventionalCommit {
	hash: string
	type: string
	scope?: string
	subject: string
	body?: string
	breaking: boolean
	/** Graduate from 0.x to 1.0.0 */
	graduate: boolean
	raw: string
	/** Files changed in this commit */
	files: string[]
}

export interface PackageInfo {
	name: string
	version: string
	path: string
	private: boolean
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}

export interface VersionBump {
	package: string
	currentVersion: string
	newVersion: string
	releaseType: ReleaseType
	commits: ConventionalCommit[]
	/** Updated dependencies that triggered this bump (for cascade bumps) */
	updatedDeps?: Array<{ name: string; version: string }>
	/** Custom changelog content from bump files (.bump/*.md) */
	bumpFileContent?: string
	/** @deprecated Use bumpFileContent instead */
	changesetContent?: string
}

export interface ReleaseContext {
	config: BumpConfig
	packages: PackageInfo[]
	commits: ConventionalCommit[]
	bumps: VersionBump[]
	dryRun: boolean
}
