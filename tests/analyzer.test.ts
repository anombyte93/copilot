import { analyze } from "../src/digest/analyzer.js";
import type { RepoActivity } from "../src/digest/collector.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date("2025-06-15T12:00:00Z");
const earlier = new Date("2025-06-15T06:00:00Z");

function makeActivities(): RepoActivity[] {
  return [
    {
      repoName: "alpha",
      fullName: "user/alpha",
      workflowRuns: [
        {
          name: "CI",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.com/user/alpha/actions/runs/1",
          created_at: now.toISOString(),
          head_branch: "main",
        },
        {
          name: "CI",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/user/alpha/actions/runs/0",
          created_at: earlier.toISOString(),
          head_branch: "main",
        },
        {
          name: "Deploy",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/user/alpha/actions/runs/2",
          created_at: now.toISOString(),
          head_branch: "main",
        },
      ],
      pullRequests: [
        {
          number: 1,
          title: "Add feature X",
          state: "open",
          user: "alice",
          html_url: "https://github.com/user/alpha/pull/1",
          updated_at: now.toISOString(),
          draft: false,
          review_decision: null,
        },
        {
          number: 2,
          title: "Draft PR",
          state: "open",
          user: "bob",
          html_url: "https://github.com/user/alpha/pull/2",
          updated_at: now.toISOString(),
          draft: true,
          review_decision: null,
        },
        {
          number: 3,
          title: "Approved PR",
          state: "open",
          user: "carol",
          html_url: "https://github.com/user/alpha/pull/3",
          updated_at: now.toISOString(),
          draft: false,
          review_decision: "APPROVED",
        },
        {
          number: 4,
          title: "Closed PR",
          state: "closed",
          user: "dave",
          html_url: "https://github.com/user/alpha/pull/4",
          updated_at: now.toISOString(),
          draft: false,
          review_decision: null,
        },
      ],
      issues: [
        {
          number: 10,
          title: "Bug report",
          state: "open",
          user: "carol",
          html_url: "https://github.com/user/alpha/issues/10",
          created_at: now.toISOString(),
          labels: ["bug"],
        },
      ],
    },
    {
      repoName: "beta",
      fullName: "user/beta",
      workflowRuns: [], // no CI
      pullRequests: [],
      issues: [
        {
          number: 20,
          title: "Feature request",
          state: "open",
          user: "eve",
          html_url: "https://github.com/user/beta/issues/20",
          created_at: now.toISOString(),
          labels: ["enhancement"],
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyze", () => {
  it("identifies CI failures from the latest run per workflow", () => {
    const report = analyze(makeActivities());

    // CI workflow: latest run (by created_at) has conclusion "failure"
    // Deploy workflow: latest run has conclusion "success" -- no failure
    expect(report.ciFailures).toHaveLength(1);
    expect(report.ciFailures[0]).toEqual({
      repo: "user/alpha",
      workflowName: "CI",
      url: "https://github.com/user/alpha/actions/runs/1",
      failedAt: now.toISOString(),
    });
  });

  it("identifies open non-draft PRs awaiting review", () => {
    const report = analyze(makeActivities());

    // PR #1 is open, not draft, not approved -> awaiting review
    // PR #2 is draft -> excluded
    // PR #3 is approved -> excluded
    // PR #4 is closed -> excluded
    expect(report.prsAwaitingReview).toHaveLength(1);
    expect(report.prsAwaitingReview[0]).toMatchObject({
      number: 1,
      title: "Add feature X",
      user: "alice",
      repoName: "user/alpha",
    });
  });

  it("counts all issues as new issues", () => {
    const report = analyze(makeActivities());

    expect(report.newIssues).toHaveLength(2);
    expect(report.newIssues[0]).toMatchObject({
      number: 10,
      title: "Bug report",
      repoName: "user/alpha",
    });
    expect(report.newIssues[1]).toMatchObject({
      number: 20,
      title: "Feature request",
      repoName: "user/beta",
    });
  });

  it("computes correct activity summary", () => {
    const report = analyze(makeActivities());

    expect(report.activitySummary).toEqual({
      reposWithActivity: 2,
      totalWorkflowRuns: 3, // 3 runs in alpha, 0 in beta
      totalPRs: 4, // 4 PRs in alpha, 0 in beta
      totalIssues: 2, // 1 in alpha, 1 in beta
    });
  });

  it("identifies repos without CI (zero workflow runs)", () => {
    const report = analyze(makeActivities());

    expect(report.reposWithoutCI).toEqual(["user/beta"]);
  });

  it("handles empty input", () => {
    const report = analyze([]);

    expect(report.ciFailures).toEqual([]);
    expect(report.prsAwaitingReview).toEqual([]);
    expect(report.newIssues).toEqual([]);
    expect(report.activitySummary).toEqual({
      reposWithActivity: 0,
      totalWorkflowRuns: 0,
      totalPRs: 0,
      totalIssues: 0,
    });
    expect(report.reposWithoutCI).toEqual([]);
  });
});
