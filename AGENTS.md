# Agent Instructions

Engineering doctrine: https://github.com/SylphxAI/doctrine

Before changing behavior, read:

1. `PROJECT.md` for this repository's goal, lifecycle, boundary, public
   surfaces, delivery proof, and package release posture.
2. `.doctrine/project.json` for the machine-readable project manifest.
3. The central doctrine entry points: `AGENTS.md`, `PRINCIPLES.md`, and
   `ADR.md` in `SylphxAI/doctrine`.
4. The triggered `standards/*.md` files from doctrine for the task.

This file is a thin runtime adapter. Keep enterprise policy in
`SylphxAI/doctrine`; keep only repo-local commands, hazards, and validation
notes here.

## Local Commands

- `bun install` - install dependencies.
- `bun run lint` - Biome check.
- `bun run typecheck` - TypeScript type check.
- `bun test` - Bun tests.
- `bun run build` - build package and CLI artifacts.

## Local Hazards

- `@sylphx/bump` is itself release automation. Changes to `action.yml`,
  `detect/action.yml`, versioning semantics, npm publishing, or release PR
  behavior are public contract changes.
- Release workflow uses `NPM_TOKEN` and publishes to npm. Published package
  versions are forward-fix-only.
- Keep release-intent behavior explicit; do not mix package publishing changes
  with unrelated product or docs edits.

## Reporting

When reporting work, separate local diff, PR state, CI state, merge state,
release state, npm publish state, and package/runtime proof.
