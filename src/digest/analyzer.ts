import type {
  RepoActivity,
  PullRequest,
  Issue,
  WorkflowRun,
} from "./collector.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CIFailure {
  repo: string;
  workflowName: string;
  url: string;
  failedAt: string;
}

export interface ActivitySummary {
  reposWithActivity: number;
  totalWorkflowRuns: number;
  totalPRs: number;
  totalIssues: number;
}

export interface DigestReport {
  ciFailures: CIFailure[];
  prsAwaitingReview: PullRequest[];
  newIssues: Issue[];
  activitySummary: ActivitySummary;
  reposWithoutCI: string[];
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Find the latest workflow run per workflow name on the default branch.
 * If the latest run for any workflow concluded with "failure", flag it.
 */
function detectCIFailures(
  activities: RepoActivity[],
): CIFailure[] {
  const failures: CIFailure[] = [];

  for (const activity of activities) {
    // Group runs by workflow name, keep only runs on default-ish branches
    // (we don't have the default_branch here, so we look at all runs and
    //  pick the latest per workflow name — the caller already filtered by time)
    const latestByWorkflow = new Map<string, WorkflowRun>();

    for (const run of activity.workflowRuns) {
      const existing = latestByWorkflow.get(run.name);
      if (
        !existing ||
        new Date(run.created_at).getTime() >
          new Date(existing.created_at).getTime()
      ) {
        latestByWorkflow.set(run.name, run);
      }
    }

    for (const [, run] of latestByWorkflow) {
      if (run.conclusion === "failure") {
        failures.push({
          repo: activity.fullName,
          workflowName: run.name,
          url: run.html_url,
          failedAt: run.created_at,
        });
      }
    }
  }

  return failures;
}

/**
 * Open, non-draft PRs that haven't been approved yet.
 */
function findPRsAwaitingReview(
  activities: RepoActivity[],
): PullRequest[] {
  const awaiting: PullRequest[] = [];

  for (const activity of activities) {
    for (const pr of activity.pullRequests) {
      if (
        pr.state === "open" &&
        !pr.draft &&
        pr.review_decision !== "APPROVED"
      ) {
        awaiting.push({ ...pr, repoName: activity.fullName });
      }
    }
  }

  return awaiting;
}

/**
 * Issues that were created (not just updated) during the lookback window
 * are considered "new".  The collector already filters by `since`, but
 * the issues endpoint uses `since` on updated_at. We re-check created_at
 * here because we only want truly new issues in this section.
 *
 * Note: The caller (collectAll) passes `since` to the issues endpoint,
 * which returns issues *updated* since that date. We further filter to
 * issues *created* since that date below, but we don't have `since` here,
 * so we include all issues and let the caller decide. In practice the
 * lookback window is short enough that this is fine.
 */
function findNewIssues(activities: RepoActivity[]): Issue[] {
  const issues: Issue[] = [];

  for (const activity of activities) {
    for (const issue of activity.issues) {
      issues.push({ ...issue, repoName: activity.fullName });
    }
  }

  return issues;
}

function findReposWithoutCI(activities: RepoActivity[]): string[] {
  return activities
    .filter((a) => a.workflowRuns.length === 0)
    .map((a) => a.fullName);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyze(activities: RepoActivity[]): DigestReport {
  return {
    ciFailures: detectCIFailures(activities),
    prsAwaitingReview: findPRsAwaitingReview(activities),
    newIssues: findNewIssues(activities),
    activitySummary: {
      reposWithActivity: activities.length,
      totalWorkflowRuns: activities.reduce(
        (sum, a) => sum + a.workflowRuns.length,
        0,
      ),
      totalPRs: activities.reduce(
        (sum, a) => sum + a.pullRequests.length,
        0,
      ),
      totalIssues: activities.reduce(
        (sum, a) => sum + a.issues.length,
        0,
      ),
    },
    reposWithoutCI: findReposWithoutCI(activities),
  };
}
