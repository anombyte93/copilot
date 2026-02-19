# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Project**: Copilot — GitHub Daily Digest & Reusable CI/CD Workflows
**Goal**: Automated daily digest of GitHub activity across 50+ repos + reusable workflow library
**Stack**: TypeScript, Node.js, @octokit/rest, GitHub Actions, Jest

---

## Project Structure

### Root Files
- `CLAUDE.md` - Claude Code instructions (this file)
- `package.json`, `tsconfig.json`, `jest.config.ts` - Project config

### src/
- `src/config.ts` - Config from env vars (GITHUB_TOKEN, DIGEST_REPO, LOOKBACK_HOURS)
- `src/index.ts` - Entry point: collect -> analyze -> format -> publish
- `src/digest/collector.ts` - GitHub API calls, paginated repo/event fetching
- `src/digest/analyzer.ts` - Classify activity, flag CI failures, identify review gaps
- `src/digest/formatter.ts` - Render markdown digest with sections
- `src/digest/publisher.ts` - Post digest as GitHub Issue with label

### .github/workflows/
- `daily-digest.yml` - Cron (7AM AWST) + manual trigger for digest
- `ci.yml` - Local CI that dog-foods reusable-ci.yml
- `reusable-ci.yml` - Reusable: commitlint, test, build, security, notify
- `reusable-claude-review.yml` - Reusable: AI code review with must-fix issue creation
- `reusable-release-please.yml` - Reusable: release management
- `reusable-review-gate.yml` - Reusable: blocks PR until review issues resolved

### tests/
- `tests/collector.test.ts` - Collector unit tests (mocked Octokit)
- `tests/analyzer.test.ts` - Analyzer unit tests
- `tests/formatter.test.ts` - Formatter output tests
- `tests/publisher.test.ts` - Publisher unit tests (mocked Octokit)

### session-context/
CLAUDE memory bank files (managed by /start skill)

---

## Structure Maintenance Rules

> These rules ensure the project stays organized across sessions.

- **CLAUDE.md** stays at root (Claude Code requirement)
- **Session context** files live in `session-context/` - NEVER at root
- **Scripts** (.sh, .ps1, .py, .js, .ts) go in `scripts/<category>/`
- **Documentation** (.md, .txt guides/reports) go in `docs/<category>/`
- **Config** files (.json, .yaml, .toml) go in `config/` unless framework-required at root
- **Logs** go in `logs/`
- When creating new files, place them in the correct category directory
- Do NOT dump new files at root unless they are actively being worked on
- Periodically review root for stale files and move to correct category

---

## Session Context Files (MUST maintain)

After every session, update these files in `session-context/` with timestamp and reasoning:

- `session-context/CLAUDE-activeContext.md` - Current session state, goals, progress
- `session-context/CLAUDE-decisions.md` - Architecture decisions and rationale
- `session-context/CLAUDE-patterns.md` - Established code patterns and conventions
- `session-context/CLAUDE-troubleshooting.md` - Common issues and proven solutions

**Entry Format**:
```markdown
## HH:MM DD/MM/YY
### REASON
Who:
What:
When:
Where:
Why:
How:
References:
Git Commit:
Potential Issues to face:
```

---

## Common Commands

### Development
```bash
npm test                          # Run all 28 unit tests
npm run build                     # TypeScript compile to dist/
npm run lint                      # Type check without emit
GITHUB_TOKEN=$(gh auth token) npx tsx src/index.ts  # Run digest locally
```

### GitHub Actions
```bash
gh workflow run daily-digest.yml --repo anombyte93/copilot  # Manual trigger
gh run list --repo anombyte93/copilot                       # Check run status
```

### Consuming Reusable Workflows (in other repos)
```yaml
# In .github/workflows/ci.yml of any repo:
jobs:
  ci:
    uses: anombyte93/copilot/.github/workflows/reusable-ci.yml@v1
    with:
      node-version: '22'
```

---

## Current Status

### DONE
- Digest engine (collector, analyzer, formatter, publisher)
- 4 reusable workflows extracted from canva-resume-fixer
- Daily digest cron workflow (7AM AWST)
- Self-consuming CI (dog-food)
- 28 unit tests, all passing
- First real digest posted (Issue #1)
- GitHub Actions workflow_dispatch verified

### NEED TO DO
- Onboard first external repo (atlas-session-lifecycle)
- Playwright visual verification of digest issue

### CRITICAL WARNINGS
- GITHUB_TOKEN needs repo + workflow scopes for full digest coverage
- Rate limiting: 50+ repos = many API calls. Currently sequential per-repo.

---

## Workflow Before Completing Tasks

1. Use 3 explore agents to understand the issue
2. Invoke `superpower:brainstorm` skill
3. Invoke PLAN mode to create a plan
4. Invoke `prd-taskmaster` skill for task breakdown backed by DEEP research
5. Invoke debugger in parallel if not a sequential task
6. After each parent task: invoke `@doubt-agent` and `@finality-agent` to verify
7. Loop until task complete and verified working from user feedback

**Research**: Use `perplexity-api-free` for comprehensive DEEP research before any work.

---

## Ralph Loop Variables

When user invokes `/ralph-wiggum:ralph-loop`:

```bash
--completion-promise [Define what "done" means for this project]
--max-iterations 5
```

---

## User Commands

### `/ralph-wiggum:ralph-loop <prompt>`
Starts Ralph Loop with variables from Ralph Loop Variables section above.

### `state`
Shows what has been done, what needs to be done, and recent content from context files.
Also updates `session-context/CLAUDE-activeContext.md`, `session-context/CLAUDE-decisions.md`, `session-context/CLAUDE-patterns.md`, `session-context/CLAUDE-troubleshooting.md` if they haven't been updated.

---

## Architecture Decisions

See `session-context/CLAUDE-decisions.md` for full decision log.

---

## Troubleshooting

See `session-context/CLAUDE-troubleshooting.md` for full troubleshooting guide.

---

## IMMUTABLE TEMPLATE RULES

> **DO NOT** edit the template files bundled with the plugin.
> Templates are immutable source-of-truth. Only edit the copies in your project.
