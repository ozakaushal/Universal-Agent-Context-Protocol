---
name: ship
description: One-command release for this repo. Checks pending changes, asks for a branch name, verifies, commits with conventional-commit style, tags v<version>, pushes, and creates the GitHub Release that triggers the npm publish workflow. Use when the user says ship, release, cut a release, publish, or "commit and push everything".
allowed-tools: Bash, Read, Edit, AskUserQuestion, Glob, Grep
---

# Ship

Takes uncommitted work from a dirty tree to a published npm release in one command.

Creating the GitHub Release triggers [.github/workflows/publish.yml](../../../.github/workflows/publish.yml),
which publishes to npm via trusted publishing (OIDC). **That step is public and
irreversible — npm forbids republishing a version once it is taken.** Gate it behind
explicit confirmation.

## Arguments

- no argument — full flow, ending in a published release
- `--no-release` — stop after pushing the branch; no tag, no release, no npm publish
- `--dry-run` — report every step it *would* take, change nothing

## Steps

### 1. Preflight

Run these and stop with a clear message if any fail:

```sh
git rev-parse --is-inside-work-tree
git remote -v
gh auth status
```

If `gh` is missing or unauthenticated, complete the flow through `git push` and tell the
user to create the release manually — do not silently skip the release.

### 2. Report pending work

```sh
git status -s -uall
git diff --stat HEAD
```

Show the user what is about to be committed, including the untracked-file count. If the
tree is clean and there is nothing to push, say so and stop — do not create an empty commit.

Sanity-check the list against [.gitignore](../../../.gitignore) before continuing. If
anything that looks like a credential (`.env*`, `.npmrc`, `*.pem`, `*.key`, `*secrets*`)
appears in the list, **stop and report it** rather than committing.

### 3. Verify

```sh
npm run lint
npm test
```

Both must pass. On failure, report the output and stop — never ship a red build.

### 4. Resync the agent context

Per [AGENTS.md](../../../AGENTS.md), `.agent/index.json` stores content hashes and goes
stale whenever tracked files change:

```sh
node bin/uacp.js update
```

Use the local `bin/`, not `npx agent-context-protocol`, so the repo tests its own CLI.
Re-run `git status -s` afterwards, since this rewrites `.agent/`.

### 5. Ask for the branch name

Use AskUserQuestion. Offer a suggestion derived from the actual diff, following
conventional-commit prefixes (`feat/`, `fix/`, `chore/`, `docs/`) — the
`global_conventions.commits` field in [.agent/manifest.json](../../../.agent/manifest.json)
is `conventional commits`.

If the user is already on a non-default branch, offer to reuse it. Never commit directly
to `main`: if the current branch is `main`, a new branch is required.

```sh
git switch -c <branch>
```

### 6. Decide the version

Read `version` from [package.json](../../../package.json).

The publish workflow **hard-fails if the release tag does not match `package.json`**, and
npm rejects a version that already exists. So check the registry before choosing:

```sh
npm view agent-context-protocol versions --json
```

If the current version is already published, ask the user for the next one — offer a
preview bump (`0.1.0-preview.2`), patch, and minor — then write it into `package.json`.
If it is unpublished, use it as-is.

### 7. Commit

Stage everything not ignored and commit in conventional-commit style, subject line under
72 characters, body explaining *why* when the change is not self-evident:

```sh
git add -A
git commit -m "<type>: <subject>"
```

### 8. Push

```sh
git push -u origin <branch>
```

Stop here if `--no-release` was passed, and report the branch URL.

### 9. Tag and release — confirm first

Show the user exactly what will happen: the tag, the version, the target branch, and the
fact that npm will receive a public publish. Get explicit confirmation.

```sh
git tag v<version>
git push origin v<version>
gh release create v<version> --target <branch> --title "v<version>" --generate-notes
```

Add `--prerelease` when the version contains `-preview`, `-alpha`, `-beta`, or `-rc`.

### 10. Report

```sh
gh run list --workflow=publish.yml --limit 1
```

Give the user the Actions run URL and the npm package URL. Tell them the publish is
asynchronous — it is not done when this skill returns.

## Failure recovery

- **Tag already exists** — `git tag -d v<version>` and `git push origin :refs/tags/v<version>`, then pick a new version. Never reuse a tag that a release already consumed.
- **Workflow fails after the release exists** — fix forward with a new patch version. The failed version number is burned on npm even if the publish did not complete.
- **Wrong branch committed to** — `git reset --soft HEAD~1` before pushing; after pushing, revert rather than force-push.
