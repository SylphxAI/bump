---
"@sylphx/bump": patch
---

Fix monorepo publish authentication in GitHub Actions

- Use NPM_CONFIG_TOKEN environment variable instead of .npmrc file
- Restore bun publish for monorepo (properly resolves workspace:^ protocol)
- Sequential publish for better error visibility
