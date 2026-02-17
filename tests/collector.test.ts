import { jest, describe, it, expect } from "@jest/globals";
import {
  listUserRepos,
  getWorkflowRuns,
  getRecentPRs,
  getRecentIssues,
  collectAll,
} from "../src/digest/collector.js";
import type { Config } from "../src/config.js";
import type { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<(...args: any[]) => any>;

/** Convenience to retrieve the underlying jest.fn() from the mock Octokit. */
function asMock(fn: unknown): MockFn {
  return fn as MockFn;
}

function createMockOctokit() {
  const mock = {
    paginate: jest.fn(),
    rest: {
      repos: { listForAuthenticatedUser: jest.fn() },
      actions: { listWorkflowRunsForRepo: jest.fn() },
      pulls: { list: jest.fn(), listReviews: jest.fn() },
      issues: { listForRepo: jest.fn() },
    },
  };
  return mock as unknown as Octokit;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const now = new Date("2025-06-15T12:00:00Z");
const yesterday = new Date("2025-06-14T12:00:00Z");
const twoDaysAgo = new Date("2025-06-13T12:00:00Z");

const sampleRepos = [
  {
    name: "alpha",
    full_name: "user/alpha",
    owner: { login: "user" },
    default_branch: "main",
    has_issues: true,
    updated_at: now.toISOString(),
  },
  {
    name: "beta",
    full_name: "user/beta",
    owner: { login: "user" },
    default_branch: "develop",
    has_issues: false,
    updated_at: yesterday.toISOString(),
  },
];

const sampleWorkflowRuns = {
  data: {
    workflow_runs: [
      {
        name: "CI",
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/user/alpha/actions/runs/1",
        created_at: now.toISOString(),
        head_branch: "main",
      },
      {
        name: "Deploy",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.com/user/alpha/actions/runs/2",
        created_at: yesterday.toISOString(),
        head_branch: "main",
      },
    ],
  },
};

const samplePRs = [
  {
    number: 1,
    title: "Add feature X",
    state: "open",
    user: { login: "alice" },
    html_url: "https://github.com/user/alpha/pull/1",
    updated_at: now.toISOString(),
    draft: false,
  },
  {
    number: 2,
    title: "Old PR",
    state: "open",
    user: { login: "bob" },
    html_url: "https://github.com/user/alpha/pull/2",
    updated_at: twoDaysAgo.toISOString(),
    draft: false,
  },
];

const sampleReviews = {
  data: [
    { user: { login: "reviewer1" }, state: "APPROVED" },
  ],
};

const sampleIssues = [
  {
    number: 10,
    title: "Bug report",
    state: "open",
    user: { login: "carol" },
    html_url: "https://github.com/user/alpha/issues/10",
    created_at: now.toISOString(),
    labels: [{ name: "bug" }],
    pull_request: undefined,
  },
  {
    number: 11,
    title: "PR masquerading as issue",
    state: "open",
    user: { login: "dave" },
    html_url: "https://github.com/user/alpha/issues/11",
    created_at: now.toISOString(),
    labels: [],
    pull_request: { url: "https://api.github.com/repos/user/alpha/pulls/11" },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listUserRepos", () => {
  it("returns paginated repos correctly", async () => {
    const octokit = createMockOctokit();
    asMock(octokit.paginate).mockResolvedValue(sampleRepos);

    const repos = await listUserRepos(octokit);

    expect(asMock(octokit.paginate)).toHaveBeenCalledWith(
      octokit.rest.repos.listForAuthenticatedUser,
      { per_page: 100, sort: "updated" },
    );
    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({
      name: "alpha",
      full_name: "user/alpha",
      owner: "user",
      default_branch: "main",
      has_issues: true,
      updated_at: now.toISOString(),
    });
    expect(repos[1]).toEqual({
      name: "beta",
      full_name: "user/beta",
      owner: "user",
      default_branch: "develop",
      has_issues: false,
      updated_at: yesterday.toISOString(),
    });
  });
});

describe("getWorkflowRuns", () => {
  it("returns workflow runs filtered by date via API param", async () => {
    const octokit = createMockOctokit();
    asMock(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue(
      sampleWorkflowRuns,
    );

    const since = yesterday;
    const runs = await getWorkflowRuns(octokit, "user/alpha", since);

    expect(asMock(octokit.rest.actions.listWorkflowRunsForRepo)).toHaveBeenCalledWith({
      owner: "user",
      repo: "alpha",
      per_page: 100,
      created: `>=${since.toISOString()}`,
    });
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      name: "CI",
      conclusion: "success",
      head_branch: "main",
    });
    expect(runs[1]).toMatchObject({
      name: "Deploy",
      conclusion: "failure",
    });
  });
});

describe("getRecentPRs", () => {
  it("filters PRs by updated_at and enriches with review decision", async () => {
    const octokit = createMockOctokit();
    asMock(octokit.paginate).mockResolvedValue(samplePRs);
    asMock(octokit.rest.pulls.listReviews).mockResolvedValue(sampleReviews);

    const since = yesterday;
    const prs = await getRecentPRs(octokit, "user/alpha", since);

    // Only PR #1 is within the window (updated_at >= yesterday)
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      number: 1,
      title: "Add feature X",
      user: "alice",
      draft: false,
      review_decision: "APPROVED",
    });
  });

  it("returns null review_decision when reviews endpoint throws", async () => {
    const octokit = createMockOctokit();
    asMock(octokit.paginate).mockResolvedValue([samplePRs[0]]);
    asMock(octokit.rest.pulls.listReviews).mockRejectedValue(
      new Error("403 Forbidden"),
    );

    const since = twoDaysAgo;
    const prs = await getRecentPRs(octokit, "user/alpha", since);

    expect(prs).toHaveLength(1);
    expect(prs[0].review_decision).toBeNull();
  });
});

describe("getRecentIssues", () => {
  it("filters out pull requests from issues endpoint", async () => {
    const octokit = createMockOctokit();
    asMock(octokit.paginate).mockResolvedValue(sampleIssues);

    const since = yesterday;
    const issues = await getRecentIssues(octokit, "user/alpha", since);

    // Issue #11 has pull_request set, so it should be filtered out
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      number: 10,
      title: "Bug report",
      user: "carol",
      labels: ["bug"],
    });
  });
});

describe("collectAll", () => {
  const config: Config = {
    githubToken: "ghp_test",
    digestRepo: "user/digest",
    lookbackHours: 24,
    excludeRepos: ["user/beta"],
    digestLabel: "digest",
  };

  it("orchestrates all collectors and excludes configured repos", async () => {
    const octokit = createMockOctokit();

    // listUserRepos via paginate (first call)
    asMock(octokit.paginate)
      .mockResolvedValueOnce(sampleRepos) // listUserRepos
      .mockResolvedValueOnce([samplePRs[0]]) // getRecentPRs for alpha
      .mockResolvedValueOnce(sampleIssues); // getRecentIssues for alpha

    // getWorkflowRuns for alpha
    asMock(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue(
      sampleWorkflowRuns,
    );

    // listReviews for the one PR
    asMock(octokit.rest.pulls.listReviews).mockResolvedValue(sampleReviews);

    const activities = await collectAll(octokit, config);

    // beta is excluded, so only alpha should appear
    expect(activities).toHaveLength(1);
    expect(activities[0].repoName).toBe("alpha");
    expect(activities[0].workflowRuns).toHaveLength(2);
    // Only one issue (the PR-masquerading issue is filtered)
    expect(activities[0].issues).toHaveLength(1);
  });

  it("handles per-repo API errors gracefully", async () => {
    const octokit = createMockOctokit();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Return only one repo (alpha), not excluded
    const singleRepo = [sampleRepos[0]];
    asMock(octokit.paginate).mockResolvedValueOnce(singleRepo);

    // Make workflow runs throw for alpha
    asMock(octokit.rest.actions.listWorkflowRunsForRepo).mockRejectedValue(
      new Error("API rate limit exceeded"),
    );

    const activities = await collectAll(octokit, {
      ...config,
      excludeRepos: [],
    });

    expect(activities).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping user/alpha"),
    );
    warnSpy.mockRestore();
  });

  it("skips repos with zero activity", async () => {
    const octokit = createMockOctokit();
    const singleRepo = [sampleRepos[0]];

    asMock(octokit.paginate)
      .mockResolvedValueOnce(singleRepo) // listUserRepos
      .mockResolvedValueOnce([]) // getRecentPRs (empty)
      .mockResolvedValueOnce([]); // getRecentIssues (empty)

    // No workflow runs
    asMock(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
      data: { workflow_runs: [] },
    });

    const activities = await collectAll(octokit, {
      ...config,
      excludeRepos: [],
    });

    expect(activities).toHaveLength(0);
  });
});
