import { Octokit } from "@octokit/rest";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoInfo {
  name: string;
  full_name: string;
  owner: string;
  default_branch: string;
  has_issues: boolean;
  updated_at: string;
}

export interface WorkflowRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  head_branch: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  user: string;
  html_url: string;
  updated_at: string;
  draft: boolean;
  review_decision: string | null;
  /** Enriched by analyzer — not set by collector */
  repoName?: string;
}

export interface Issue {
  number: number;
  title: string;
  state: string;
  user: string;
  html_url: string;
  created_at: string;
  labels: string[];
  /** Enriched by analyzer — not set by collector */
  repoName?: string;
}

export interface RepoActivity {
  repoName: string;
  fullName: string;
  workflowRuns: WorkflowRun[];
  pullRequests: PullRequest[];
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOwnerRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

export async function listUserRepos(octokit: Octokit): Promise<RepoInfo[]> {
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
  });

  return repos.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    owner: r.owner?.login ?? "",
    default_branch: r.default_branch ?? "main",
    has_issues: r.has_issues ?? true,
    updated_at: r.updated_at ?? "",
  }));
}

export async function getWorkflowRuns(
  octokit: Octokit,
  repo: string,
  since: Date,
): Promise<WorkflowRun[]> {
  const { owner, repo: repoName } = parseOwnerRepo(repo);
  const sinceISO = since.toISOString();

  // The Actions API accepts created filter with >=
  const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo: repoName,
    per_page: 100,
    created: `>=${sinceISO}`,
  });

  return data.workflow_runs.map((run) => ({
    name: run.name ?? "unknown",
    status: run.status ?? "unknown",
    conclusion: run.conclusion ?? null,
    html_url: run.html_url,
    created_at: run.created_at,
    head_branch: run.head_branch ?? "",
  }));
}

export async function getRecentPRs(
  octokit: Octokit,
  repo: string,
  since: Date,
): Promise<PullRequest[]> {
  const { owner, repo: repoName } = parseOwnerRepo(repo);
  const sinceTime = since.getTime();

  const prs = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo: repoName,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  const recentPRs = prs.filter(
    (pr) => new Date(pr.updated_at).getTime() >= sinceTime,
  );

  // Fetch review decision for each PR via the reviews endpoint
  const enriched: PullRequest[] = await Promise.all(
    recentPRs.map(async (pr) => {
      let reviewDecision: string | null = null;
      try {
        const { data: reviews } = await octokit.rest.pulls.listReviews({
          owner,
          repo: repoName,
          pull_number: pr.number,
          per_page: 100,
        });
        // Derive an aggregate decision from latest reviews per reviewer
        const latestByUser = new Map<string, string>();
        for (const review of reviews) {
          if (review.state && review.state !== "COMMENTED") {
            latestByUser.set(review.user?.login ?? "unknown", review.state);
          }
        }
        const states = [...latestByUser.values()];
        if (states.includes("CHANGES_REQUESTED")) {
          reviewDecision = "CHANGES_REQUESTED";
        } else if (states.includes("APPROVED")) {
          reviewDecision = "APPROVED";
        }
      } catch {
        // Reviews not accessible — leave null
      }

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user: pr.user?.login ?? "unknown",
        html_url: pr.html_url,
        updated_at: pr.updated_at,
        draft: pr.draft ?? false,
        review_decision: reviewDecision,
      };
    }),
  );

  return enriched;
}

export async function getRecentIssues(
  octokit: Octokit,
  repo: string,
  since: Date,
): Promise<Issue[]> {
  const { owner, repo: repoName } = parseOwnerRepo(repo);

  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo: repoName,
    state: "all",
    since: since.toISOString(),
    per_page: 100,
  });

  // The issues endpoint also returns PRs — filter them out by checking pull_request field
  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      user: issue.user?.login ?? "unknown",
      html_url: issue.html_url,
      created_at: issue.created_at,
      labels: issue.labels.map((l) =>
        typeof l === "string" ? l : l.name ?? "",
      ),
    }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function collectAll(
  octokit: Octokit,
  config: Config,
): Promise<RepoActivity[]> {
  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000);
  const repos = await listUserRepos(octokit);

  const excludeSet = new Set(
    config.excludeRepos.map((r) => r.toLowerCase()),
  );

  const eligible = repos.filter(
    (r) =>
      !excludeSet.has(r.full_name.toLowerCase()) &&
      !excludeSet.has(r.name.toLowerCase()),
  );

  const activities: RepoActivity[] = [];

  for (const repo of eligible) {
    try {
      const [workflowRuns, pullRequests, issues] = await Promise.all([
        getWorkflowRuns(octokit, repo.full_name, since),
        getRecentPRs(octokit, repo.full_name, since),
        getRecentIssues(octokit, repo.full_name, since),
      ]);

      // Only include repos that actually had activity
      if (
        workflowRuns.length > 0 ||
        pullRequests.length > 0 ||
        issues.length > 0
      ) {
        activities.push({
          repoName: repo.name,
          fullName: repo.full_name,
          workflowRuns,
          pullRequests,
          issues,
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[collector] Skipping ${repo.full_name}: ${message}`,
      );
    }
  }

  return activities;
}
