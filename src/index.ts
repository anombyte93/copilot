import { Octokit } from "@octokit/rest";
import { getConfig } from "./config.js";
import { collectAll } from "./digest/collector.js";
import { analyze } from "./digest/analyzer.js";
import { formatDigest } from "./digest/formatter.js";
import { publishDigest } from "./digest/publisher.js";

async function main(): Promise<void> {
  const config = getConfig();

  const octokit = new Octokit({ auth: config.githubToken });

  console.log(
    `Collecting activity from the last ${config.lookbackHours} hours...`,
  );
  const activities = await collectAll(octokit, config);
  console.log(`Found activity in ${activities.length} repos.`);

  const report = analyze(activities);
  const markdown = formatDigest(report, new Date());

  console.log(`Publishing digest to ${config.digestRepo}...`);
  const issueUrl = await publishDigest(
    octokit,
    config.digestRepo,
    markdown,
    config.digestLabel,
  );

  console.log(`Digest published: ${issueUrl}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});

// Re-export types for external consumers and tests
export type { Config } from "./config.js";
export { getConfig } from "./config.js";
export type {
  RepoInfo,
  WorkflowRun,
  PullRequest,
  Issue,
  RepoActivity,
} from "./digest/collector.js";
export {
  listUserRepos,
  getWorkflowRuns,
  getRecentPRs,
  getRecentIssues,
  collectAll,
} from "./digest/collector.js";
export type {
  CIFailure,
  ActivitySummary,
  DigestReport,
} from "./digest/analyzer.js";
export { analyze } from "./digest/analyzer.js";
export { formatDigest } from "./digest/formatter.js";
export { publishDigest } from "./digest/publisher.js";
