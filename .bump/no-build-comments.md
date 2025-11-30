---
release: patch
---

- Add comments documenting that bump does NOT build packages
- Add --ignore-scripts to npm publish to prevent accidental build triggers
- Filter out commits that only touch .bump/ files from changelog
