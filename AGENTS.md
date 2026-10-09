# Agent Guide

## Default Workflow

Work inside the provided devcontainer. The container starts at `/workspaces/${localWorkspaceFolderBasename}` with git and Node.js. Use the normal edit-run loop from bash.

## Common Commands

- Prefer the `Makefile` for common project commands: use `make run` to run the project, `make install` to install it, and `make test` to run the tests. Only fall back to raw commands when a task isn't covered by a Makefile target.

## Environment Rules

- Install Node packages with `npm` into the project's `node_modules`. Do not use other package managers.
- Do not use the terminal sandbox (aka bwrap or Bubblewrap); it interferes with devcontainer path sharing.

## Editing and Design Rules

- Use the editor tools to modify files. Never patch files through terminal commands or arbitrary scripts, and do not leave temporary files behind.
- Keep the package small and object-oriented where shared behavior exists.
- Do not hide failures: never swallow exceptions with a bare `try`/`catch` and `console.log`. Re-throw or use `console.error` only when resilience is required.
- Keep shell scripts fail-fast. Do not use `|| true` to silence failures.

## Test Rules

- Run tests with `node --test` (via `make test`), not an MCP test tool, so output remains visible and responsive.
- For expected failures, keep diagnostic output visible rather than suppressing it.