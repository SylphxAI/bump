# Bump Project

Bump is a production release-automation tool for Bun/JavaScript projects. It
turns Conventional Commits and optional bump files into release PRs, changelogs,
semantic versions, GitHub releases, and npm publishes.

## Goals

- Own the `@sylphx/bump` CLI, GitHub Action, release PR logic, monorepo package
  detection, changelog generation, and npm publishing workflow.
- Keep package release semantics explicit, testable, and compatible with Bun,
  npm, yarn, pnpm, and workspace protocols.
- Dogfood the local action through the repo release workflow before publishing.

## Non-Goals

- Do not own downstream repositories' product release policy, branch
  protection, npm credentials, or publishing approval.
- Do not silently redefine Changesets, npm, GitHub Actions, or enterprise
  doctrine behavior outside Bump's documented public contract.
- Do not treat source revert as complete recovery after a package version has
  been published.

## Boundaries

Owned contexts are release intent parsing, package graph detection, version
planning, release PR creation, changelog generation, GitHub release automation,
and npm publishing through the Bump action/CLI.

Public surfaces:

- npm package and CLI: `@sylphx/bump`, `bump`.
- GitHub Action entrypoints: `action.yml` and `detect/action.yml`.
- Release workflow examples under `examples/`.
- Required branch context: `test`.

## Delivery

Current CI model: `legacy-ci`. Required branch context is `test`.

Release path: `.github/workflows/release.yml` builds the package and dogfoods
the local action to create release PRs or publish with `NPM_TOKEN`.
Production proof must include CI, build output, generated release PR or publish
run, npm package readback, and GitHub release/changelog evidence.

Recovery class: `forward-fix-only`, because npm package versions and consumer
automation behavior cannot be fully undone by source revert.

## References

- Machine manifest: `.doctrine/project.json`
- Public docs: `README.md`
- Action entrypoint: `action.yml`
- Detect action entrypoint: `detect/action.yml`
- CI: `.github/workflows/ci.yml`
- Release: `.github/workflows/release.yml`
- Doctrine: https://github.com/SylphxAI/doctrine
