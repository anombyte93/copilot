export interface Config {
  githubToken: string;
  digestRepo: string;
  lookbackHours: number;
  excludeRepos: string[];
  digestLabel: string;
}

export function getConfig(): Config {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const digestRepo = process.env.DIGEST_REPO || "anombyte93/copilot";

  const lookbackHours = process.env.LOOKBACK_HOURS
    ? parseInt(process.env.LOOKBACK_HOURS, 10)
    : 24;

  if (Number.isNaN(lookbackHours) || lookbackHours <= 0) {
    throw new Error("LOOKBACK_HOURS must be a positive integer");
  }

  const excludeRepos = process.env.EXCLUDE_REPOS
    ? process.env.EXCLUDE_REPOS.split(",").map((r) => r.trim()).filter(Boolean)
    : [];

  const digestLabel = process.env.DIGEST_LABEL || "digest";

  return {
    githubToken,
    digestRepo,
    lookbackHours,
    excludeRepos,
    digestLabel,
  };
}
