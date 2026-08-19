# Security Policy

## Preview status

UACP is an **early preview** (`0.1.0-preview.x`) published for evaluation and testing.
It is not recommended for production repositories yet. Interfaces, generated file
formats, and defaults may change without a deprecation period.

## Supported versions

Only the latest `preview` release receives fixes. There is no backport branch.

## Reporting a vulnerability

Please report privately rather than opening a public issue:

- Use GitHub's **Report a vulnerability** button under the repository's Security tab, or
- Email the maintainers listed in `package.json`.

Include the version, your platform, and the smallest reproduction you can manage.
Expect an acknowledgement within 7 days.

## What UACP does to your machine

Being explicit, since the tool writes outside its own directory:

| Action | Where | When |
| --- | --- | --- |
| Creates `.agent/`, `AGENTS.md`, `CLAUDE.md` | repository root | `init`, after you confirm |
| Appends a managed block to `post-commit` | `.git/hooks/post-commit` | `init` and `update` |
| Runs your `lint` and `test` npm scripts | repository root | `.agent/verify.sh <feature>` |

The git hook is **additive** — existing hook content is preserved, and the block is
only added once (it is keyed on the `# UACP managed hook.` marker). Remove that block
to uninstall it.

`.agent/verify.sh` executes the `lint` and `test` scripts from the repository's
`package.json`. Treat running it in a repository you do not trust the same way you
would treat running `npm test` there.

## What goes into the index

`.agent/index.json` records, for each indexed file, its **path and a SHA-256 of its
contents** — never the contents themselves. Because that file is meant to be committed,
UACP excludes from indexing:

- anything `git check-ignore` reports as ignored,
- common secret-bearing filenames (`.env*`, `.npmrc`, `.netrc`, `id_rsa`, `*.pem`,
  `*.key`, `*secrets*.json|yaml|toml`, `local.settings.json`, `appsettings.<env>.json`),
- non-text extensions and build/dependency directories.

When UACP cannot reach git (not a repository, git not installed), the gitignore filter
is unavailable and only the filename denylist applies. **Review `.agent/index.json`
before your first commit**, and treat it as you would any other generated, committed
artifact.

If you find a filename pattern that should be excluded and is not, that is a valid
security report — please send it.
