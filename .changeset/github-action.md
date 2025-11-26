---
"@sylphx/bump": minor
---

Add Release PR mode and three release workflows

Features:
- New `bump pr` command to create/update release PRs
- Release PR is auto-maintained - merge to release
- Three release modes: local, manual trigger, release PR
- Example workflows for each mode

This makes bump a complete replacement for changesets with simpler workflow:
- No manual changeset files needed
- Version determined automatically from conventional commits
- You control when to release (merge PR or trigger workflow)
