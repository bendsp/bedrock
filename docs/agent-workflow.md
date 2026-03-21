# Agent Workflow

Bedrock now assumes a `pnpm`-first, local-first workflow for both humans and agents.

## Install and run

- Install dependencies: `pnpm install`
- Start the desktop app in dev: `pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test:unit`
- Electron E2E: `pnpm test:e2e`
- Full CI-equivalent local pass: `pnpm test`

## Required environment

Create a local `.env` from `.env.example` when you need hosted integrations.

- `SENTRY_DSN`: enables runtime error capture in Electron main + renderer
- `SENTRY_ENVIRONMENT`: optional release environment tag
- `SENTRY_AUTH_TOKEN`: optional, only needed if you later add source-map upload
- `LINEAR_API_KEY`: token for agent-created Linear issues
- `LINEAR_TEAM_ID`: default Linear team destination
- `LINEAR_PROJECT_ID`: optional default Linear project destination
- `GITHUB_TOKEN` or `GH_TOKEN`: only required for repo bootstrap scripts outside authenticated `gh` sessions

## Local-first agent loop

1. Inspect the repo and reproduce locally.
2. Run the narrowest check that proves the bug or regression.
3. Use `pnpm test:e2e` when the behavior touches the actual desktop flow.
4. Check Sentry for release-linked runtime errors when the failure is not locally obvious.
5. Open or update a Linear issue with `pnpm linear:create-issue --title "..."`.
6. Implement on a branch named like `agent/<linear-or-topic-slug>`.
7. Run the relevant checks again.
8. Open a draft PR with validation results and artifact links.

## Known truth sources

- GitHub: source code, PRs, workflows, release artifacts
- Linear: active planning and issue tracking
- Sentry: runtime failures and release-linked crash/error context
- Playwright artifacts: UI traces, screenshots, and videos for Electron regressions

## GitHub repo bootstrap

- Sync labels: `pnpm repo:sync-labels`
- Protect `main`: `pnpm repo:protect-main`

Run the protection step only after the CI workflow in this branch has landed on `main`, otherwise GitHub will require checks that do not exist yet on the default branch.

## Linear issue body shape

When an agent creates or updates a Linear issue, include:

- reproduction steps
- expected behavior
- actual behavior
- logs or artifact links
- linked draft PR when one exists
