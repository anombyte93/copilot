import { Octokit } from "@octokit/rest";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function publishDigest(
  octokit: Octokit,
  digestRepo: string,
  markdown: string,
  label: string,
): Promise<string> {
  const [owner, repo] = digestRepo.split("/");
  if (!owner || !repo) {
    throw new Error(
      `Invalid digestRepo format "${digestRepo}". Expected "owner/repo".`,
    );
  }

  // Ensure the label exists — create it if missing
  try {
    await octokit.rest.issues.getLabel({ owner, repo, name: label });
  } catch (error: unknown) {
    const status =
      error instanceof Object && "status" in error
        ? (error as { status: number }).status
        : 0;

    if (status === 404) {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label,
        color: "0075ca",
        description: "Daily digest report",
      });
    } else {
      throw error;
    }
  }

  const title = `Daily Digest: ${formatDate(new Date())}`;

  const { data: issue } = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body: markdown,
    labels: [label],
  });

  return issue.html_url;
}
