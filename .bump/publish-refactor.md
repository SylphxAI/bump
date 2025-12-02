---
release: minor
---

### Refactored publish command for reliability and safety

**New Features:**
- Pre-publish validation: checks `files`, `main`, `module`, `types`, `exports` fields exist before publishing
- Idempotent publish: compares local version vs npm, safe to re-run after partial failures
- Tag recovery: automatically creates missing tags from previous partial failures

**Breaking Changes:**
- Now uses `--ignore-scripts` for npm publish - CI must build packages BEFORE calling bump
- Removed `isReleaseCommit()` check - publish always compares local vs npm version

**Improvements:**
- Workspace deps now always restored via try/finally (even on failure)
- Single code path instead of two (simpler, fewer bugs)
- Better error messages with build reminder
