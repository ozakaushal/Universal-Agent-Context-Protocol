# Agent Context Protocol

Follow these steps before and during every task:

1. Read `.agent/manifest.json`.
2. Run `git status -s`. If it shows files absent from `.agent/index.json`, run `npx agent-context-protocol update`. If `last_synced_commit` differs from `git rev-parse HEAD`, also run `npx agent-context-protocol update`.
3. Look up task-relevant paths in `.agent/index.json` to find feature files.
4. Load only the matched `.agent/features/<name>.json` files; do not load unrelated feature files.
5. Run `.agent/verify.sh <feature>` before editing.
6. After edits, rerun verification. Do not set `status` to `done` unless it passes.
7. Update the matched feature file's `handoff` block before ending the session.

## Skills

Repo-specific procedures live in `.agent/skills/`. Load one only when its trigger matches
the task at hand.

- [`ship`](.agent/skills/ship.md) — one-command release: check pending changes, branch, verify, commit, tag, push, and create the GitHub Release that publishes to npm.
