import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { publishDigest } from "../src/digest/publisher.js";
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
    rest: {
      issues: {
        getLabel: jest.fn(),
        createLabel: jest.fn(),
        create: jest.fn(),
      },
    },
  };
  return mock as unknown as Octokit;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const digestRepo = "user/digest";
const markdown = "# Daily Digest\n\nTest body content";
const label = "digest";
const issueUrl = "https://github.com/user/digest/issues/42";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("publishDigest", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a label if it does not exist (404 from getLabel)", async () => {
    const octokit = createMockOctokit();

    const notFoundError = Object.assign(new Error("Not Found"), { status: 404 });
    asMock(octokit.rest.issues.getLabel).mockRejectedValue(notFoundError);
    asMock(octokit.rest.issues.createLabel).mockResolvedValue({});
    asMock(octokit.rest.issues.create).mockResolvedValue({
      data: { html_url: issueUrl },
    });

    const url = await publishDigest(octokit, digestRepo, markdown, label);

    expect(asMock(octokit.rest.issues.getLabel)).toHaveBeenCalledWith({
      owner: "user",
      repo: "digest",
      name: label,
    });
    expect(asMock(octokit.rest.issues.createLabel)).toHaveBeenCalledWith({
      owner: "user",
      repo: "digest",
      name: label,
      color: "0075ca",
      description: "Daily digest report",
    });
    expect(url).toBe(issueUrl);
  });

  it("handles label already existing (getLabel succeeds)", async () => {
    const octokit = createMockOctokit();

    asMock(octokit.rest.issues.getLabel).mockResolvedValue({
      data: { name: label },
    });
    asMock(octokit.rest.issues.create).mockResolvedValue({
      data: { html_url: issueUrl },
    });

    const url = await publishDigest(octokit, digestRepo, markdown, label);

    expect(asMock(octokit.rest.issues.createLabel)).not.toHaveBeenCalled();
    expect(url).toBe(issueUrl);
  });

  it("re-throws non-404 errors from getLabel", async () => {
    const octokit = createMockOctokit();

    const serverError = Object.assign(new Error("Server Error"), { status: 500 });
    asMock(octokit.rest.issues.getLabel).mockRejectedValue(serverError);

    await expect(
      publishDigest(octokit, digestRepo, markdown, label),
    ).rejects.toThrow("Server Error");

    expect(asMock(octokit.rest.issues.createLabel)).not.toHaveBeenCalled();
  });

  it("creates an issue with correct title format, body, and label", async () => {
    const octokit = createMockOctokit();

    asMock(octokit.rest.issues.getLabel).mockResolvedValue({
      data: { name: label },
    });
    asMock(octokit.rest.issues.create).mockResolvedValue({
      data: { html_url: issueUrl },
    });

    await publishDigest(octokit, digestRepo, markdown, label);

    expect(asMock(octokit.rest.issues.create)).toHaveBeenCalledWith({
      owner: "user",
      repo: "digest",
      title: "Daily Digest: 2025-06-15",
      body: markdown,
      labels: [label],
    });
  });

  it("returns the issue URL", async () => {
    const octokit = createMockOctokit();

    asMock(octokit.rest.issues.getLabel).mockResolvedValue({
      data: { name: label },
    });
    asMock(octokit.rest.issues.create).mockResolvedValue({
      data: { html_url: issueUrl },
    });

    const url = await publishDigest(octokit, digestRepo, markdown, label);

    expect(url).toBe(issueUrl);
  });

  it("throws for invalid digestRepo format", async () => {
    const octokit = createMockOctokit();

    await expect(
      publishDigest(octokit, "invalid-no-slash", markdown, label),
    ).rejects.toThrow("Invalid digestRepo format");
  });
});
