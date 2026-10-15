# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

`@cyc-seattle/gsuite-sdk` wraps the Google Workspace APIs that CYC's tools call: Calendar, Sheets,
the Admin SDK Directory, and Groups Settings. `@cyc-seattle/gsuite-sdk/fake` is a Workspace fake
for the Directory and Groups Settings calls. The README documents both.

## Development environment

mise provides the tools in `mise.toml`. Run `mise trust`, then `mise run install`.

- `mise run ci` — `check`, `test`, and `integration`, as CI runs them
- `mise run check` — typecheck, format check, and lint
- `mise run test` — the unit tests in `test/`
- `mise run integration` — the Gherkin features in `features/`, against the fake
- `mise run format` — fix formatting with Prettier and ESLint

Keep a task's `run` to about two lines. Put anything longer in `scripts/`.

## Layout

- `src/` — the SDK. `src/fake/` is the Workspace fake: `model.ts` holds groups, members, and
  settings in memory, and `server.ts` serves them over HTTP at the paths googleapis calls.
- `test/` — unit tests. They mock googleapis, and they test the fake's model and server directly.
- `features/` — the `*.feature` files. Each one's steps are in the `test/features/*.test.ts` of the
  same name, which only `mise run integration` runs. Steps that more than one feature uses are in
  `test/features/steps.ts`, and `test/features/world.ts` holds one scenario's fake, clients, and
  run ID.
- `Dockerfile` — runs the fake as a container. Releases publish it as `ghcr.io/cyc-seattle/workspace-fake`.

## Testing

- Write features with the `write-feature` skill from
  [`cyc-seattle/agent-skills`](https://github.com/cyc-seattle/agent-skills).
- Integration scenarios drive the real `DirectoryClient` and `GroupSettingsClient` against the
  fake through `rootUrl`, with no pacing delays. The fake runs in the test process, so the task
  needs no Docker.
- Their auth refuses any URL outside the fake, so a client that loses its `rootUrl` fails instead
  of calling Google. No test reaches the network.
- `ManualClock` steps time past the fake's delays, so no test sleeps.
- When the SDK calls a new endpoint, add it to the fake's model and server, with Google's status
  codes and error bodies.

## Code style

- TypeScript with `@tsconfig/strictest`, ESLint, and Prettier, from `@cyc-seattle/ts-config`
- ESM. Import paths carry the `.js` extension.
- Comments explain why, not what, in a line or two. Write one where a reader would otherwise get
  it wrong. Cite an issue instead of recounting it.
- Docs record the outcome, not the path to it, and use no personal identifiers.

## Working in this repo

- PR titles are conventional commits. PRs merge by squash, and a merge to `main` releases from
  the title.
- Never push to `main`.
