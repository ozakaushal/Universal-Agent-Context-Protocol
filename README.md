# UACP

> **⚠️ Early preview — under active testing.**
> UACP is published as `0.1.0-preview.x` under the `preview` dist-tag so it is evaluated
> deliberately rather than installed by default. Generated file formats and CLI behaviour
> may change without notice. Try it on a repository you can throw away first, and review
> what it generates before committing. Not recommended for production repositories yet.

Universal Agent Context Protocol is a dependency-free CLI that creates small, structured and verifiable context files for AI coding agents. It uses deterministic filesystem heuristics and never makes LLM calls.

## Usage

Run in the root of any Git repository:

```sh
npx agent-context-protocol@preview init
npx agent-context-protocol@preview update
```

`init` starts with a guided setup: it shows the detected tech stack, lets you confirm or edit the project and convention values, then displays a summary of everything it will touch — including the git hook — and asks for final approval before creating anything. It creates `.agent/`, `AGENTS.md`, and `CLAUDE.md`, then installs an additive post-commit hook. It refuses to overwrite an existing `.agent/` directory. `update` is idempotent and safely rebuilds the file-to-feature index.

For agents that do not automatically read project instructions: **Read AGENTS.md first before doing anything.**

## Generated files

- `.agent/manifest.json`: compact project router
- `.agent/index.json`: generated path, feature, hash, and sync-commit map
- `.agent/features/*.json`: one strict task-state document per feature
- `.agent/verify.sh`: deterministic per-feature verifier

## What gets indexed

`.agent/index.json` stores each file's **path and a SHA-256 of its contents** — never the contents. Since that file is committed, UACP deliberately leaves out:

- anything `git check-ignore` reports as ignored,
- common secret-bearing filenames — `.env*`, `.npmrc`, `.netrc`, `id_rsa`, `*.pem`, `*.key`, `*secrets*.json|yaml|toml`, `local.settings.json`, `appsettings.<env>.json`,
- build and dependency directories, and non-text extensions.

If git is unavailable, the gitignore filter cannot run and only the filename denylist applies. Review `.agent/index.json` before your first commit.

## The post-commit hook

`init` and `update` append a marked block to `.git/hooks/post-commit`:

```sh
# UACP managed hook. Keep this block when adding local post-commit actions.
```

Existing hook content is preserved and the block is added only once. Delete the block to uninstall it.

## Verification

`.agent/verify.sh <feature>` checks that every file tracked by a feature still exists, then runs your `lint` and `test` npm scripts. It rejects feature names that resolve outside `.agent/features/`. Because it executes scripts from the repository's `package.json`, run it only in repositories you trust.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

The repository is public for transparency. Reuse is governed by the included license.
Note that the current license permits evaluation only; see [LICENSE](LICENSE) before
depending on this package.
