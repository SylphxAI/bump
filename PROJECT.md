# SylphxAI Bump

SylphxAI/bump is a Bun-based semantic release, changelog, and package publishing tool with a CLI and composite GitHub Action.

## Lifecycle

- State: `production`
- Layer: `tooling`
- Machine manifest: [`.doctrine/project.json`](./.doctrine/project.json)

## Goals

- Provide the `@sylphx/bump` CLI for semantic versioning, changelog generation, release PRs, and package publishing.
- Provide the composite GitHub Action surface used by repositories that want bump-driven release automation.
- Support monorepo package detection, workspace dependency resolution, bump files, prereleases, GitHub releases, and npm publication.

## Non-Goals

- This repository does not own the products or packages that consume bump.
- This repository does not own organization-wide branch protection, release approval policy, npm token rotation, or package registry operations.
- This repository does not own enterprise engineering doctrine.

## Boundary

This repository owns bump's CLI, release engine, GitHub Action wrapper, tests, examples, package metadata, and release workflow. Consuming repositories own their release eligibility, secrets, package contents, and deployment outcomes.

## Public Surfaces

- CLI and package README: [`README.md`](./README.md)
- Package manifest and scripts: [`package.json`](./package.json)
- CLI entry point: [`src/cli.ts`](./src/cli.ts)
- Release core: [`src/core/`](./src/core/)
- GitHub adapter: [`src/adapters/github.ts`](./src/adapters/github.ts)
- Composite action: [`action.yml`](./action.yml)
- Detect action: [`detect/action.yml`](./detect/action.yml)
- Workflow examples: [`examples/`](./examples/)
- CI and release workflows: [`.github/workflows/`](./.github/workflows/)

## Delivery

The repository has Bun-based CI for pull requests and merge queue, plus a main-branch release workflow that dogfoods the local composite action. Production proof is passing lint/typecheck/tests/build plus release workflow evidence for package publication. This manifest slice is documentation-only and does not change release behavior, package code, CI, or publishing configuration.
