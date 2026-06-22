# Bump Project Boundary

Bump is the Sylphx release automation CLI and GitHub Action. It turns conventional commits and optional bump files into release PRs, changelogs, semantic versions, and npm publication.

## Goals

- Keep the `bump` CLI and GitHub Action stable for package repositories.
- Own version calculation, changelog generation, release PR creation, workspace/package detection, cascade bump logic, and publish orchestration.
- Maintain tests, workflow examples, action metadata, dogfood release workflow, and package documentation.

## Non-Goals

- Do not own consuming repositories' API compatibility, package-specific release intent, pricing, roadmap, or product launch policy.
- Do not own GitHub branch protection, npm org permissions, runner fleet capacity, or central CI admission policy.
- Do not own runtime deploy, database migration, canary, rollback, or production app recovery behavior.

## Required Records

- Public CLI, GitHub Action input/output, publish semantics, or roadmap decisions should be recorded in ADRs under `docs/adr/` before they become durable policy.
- Release intent is expressed through conventional commits and optional bump files.
- The machine-readable project source of truth is `.doctrine/project.json`.

## Agent Entry

Before changing behavior, read `.doctrine/project.json`, this file, `README.md`, `action.yml`, and the affected tests. Keep Bump reusable and zero-knowledge of consuming project internals.
