# Skill: ship

Agent-agnostic mirror of [.claude/skills/ship/SKILL.md](../../.claude/skills/ship/SKILL.md).
Any agent that reads `AGENTS.md` rather than Claude Code's skill loader should follow this file.

**Purpose:** take uncommitted work from a dirty tree to a published npm release in one command.

**Trigger:** the user says ship, release, cut a release, publish, or "commit and push everything".

**Irreversible step:** creating the GitHub Release fires `.github/workflows/publish.yml`,
which publishes to npm over OIDC. npm forbids republishing a version once taken. Confirm
with the user before step 9.

## Sequence

| # | Step | Command | Gate |
|---|------|---------|------|
| 1 | Preflight | `git rev-parse --is-inside-work-tree`, `git remote -v`, `gh auth status` | stop on failure |
| 2 | Report pending work | `git status -s -uall`, `git diff --stat HEAD` | stop if clean; stop if a secret-shaped path appears |
| 3 | Verify | `npm run lint && npm test` | must pass |
| 4 | Resync context | `node bin/uacp.js update` | rewrites `.agent/`; re-check status |
| 5 | Ask branch name | `git switch -c <branch>` | never commit to `main` |
| 6 | Decide version | `npm view agent-context-protocol versions --json` | must be unpublished; must match the tag |
| 7 | Commit | `git add -A && git commit -m "<type>: <subject>"` | conventional commits |
| 8 | Push | `git push -u origin <branch>` | stop here if `--no-release` |
| 9 | Tag + release | `git tag v<version>`, `git push origin v<version>`, `gh release create v<version> --target <branch> --title "v<version>" --generate-notes` | **confirm first**; add `--prerelease` for preview/alpha/beta/rc |
| 10 | Report | `gh run list --workflow=publish.yml --limit 1` | publish is async |

## Arguments

- *(none)* — full flow through to a published release
- `--no-release` — stop after step 8
- `--dry-run` — report intended actions, change nothing

## Constraints specific to this repo

- `global_conventions.commits` in `.agent/manifest.json` is **conventional commits**.
- The publish workflow hard-fails when the release tag does not equal `package.json` version.
- `.agent/index.json` stores content hashes, so step 4 must run *before* the commit or the
  committed index is stale.
- Use the local `bin/uacp.js`, not `npx agent-context-protocol`, so the repo exercises its own CLI.

## Recovery

- **Tag exists** — `git tag -d v<version>` + `git push origin :refs/tags/v<version>`, then pick a new version.
- **Workflow failed after release created** — fix forward with a new patch version; the number is burned on npm regardless.
- **Committed to the wrong branch** — `git reset --soft HEAD~1` if unpushed; revert (never force-push) if pushed.
