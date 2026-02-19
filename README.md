# Atlas-Copilot — Reusable CI/CD Workflows

Reusable CI/CD and Claude Code review workflows for GitHub repositories.

## Quick Start

### CI Pipeline

Call the reusable CI workflow from your repository:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  ci:
    uses: anombyte93/atlas-copilot/.github/workflows/reusable-ci.yml@v1
    with:
      node-version: '22'
      test-command: 'npm test -- --coverage --ci'
```

### Claude Code Review

Automated PR review powered by Claude:

```yaml
# .github/workflows/claude-review.yml
name: Claude Review
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]
  issues:
    types: [assigned]

jobs:
  review:
    uses: anombyte93/atlas-copilot/.github/workflows/reusable-claude-review.yml@v1
    secrets: inherit
    with:
      review-instructions: 'Focus on security and performance.'
```

## Workflows

### Reusable CI Pipeline

Full CI pipeline with commitlint, tests, build, and security audit.

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `node-version` | string | `'22'` | Node.js version |
| `run-lint` | boolean | `true` | Run commitlint on PR title |
| `test-command` | string | `'npm test -- --coverage --ci'` | Test command |
| `build-command` | string | `'npm run build'` | Build command |
| `install-command` | string | `'npm ci'` | Install command |
| `run-security-audit` | boolean | `true` | Run `npm audit` |

**Jobs**: commitlint, test, build, security audit, result notification comment.

### Reusable Claude Code Review

AI-powered PR review that creates GitHub issues for must-fix findings and sets commit statuses.

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `review-instructions` | string | `''` | Extra review instructions appended to base prompt |
| `allowed-bots` | string | `'dependabot[bot],renovate[bot]'` | Comma-separated bot usernames to allow |

**Required secrets**: `ANTHROPIC_API_KEY` — passed via `secrets: inherit` or explicitly.

**Behavior**:
- Reviews PRs for security vulnerabilities, TypeScript strictness, and performance
- Classifies findings by severity: `must-fix`, `should-fix`, `suggestion`
- Creates GitHub issues with `review-blocking` label for must-fix findings
- Sets commit status to failure when must-fix findings exist
- Uploads review transcript as artifact (30-day retention)

## Required Secrets

| Secret | Required By | Description |
|--------|-------------|-------------|
| `ANTHROPIC_API_KEY` | Claude Review | Anthropic API key for Claude |

The CI pipeline uses only `github.token` (automatic).

## Versioning

Use the `@v1` tag for stable releases:

```yaml
uses: anombyte93/atlas-copilot/.github/workflows/reusable-ci.yml@v1
```

Breaking changes will increment the major version tag.

## License

MIT
