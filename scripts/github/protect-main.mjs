#!/usr/bin/env node

import { execSync } from "node:child_process";
import process from "node:process";

const requiredContexts = ["lint", "typecheck", "unit", "e2e"];

const detectRepo = () => {
  const remote = execSync("git remote get-url origin", {
    encoding: "utf8",
  }).trim();

  const sshMatch = remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!sshMatch) {
    throw new Error(`Unable to determine owner/repo from remote: ${remote}`);
  }
  return { owner: sshMatch[1], repo: sshMatch[2] };
};

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error("Missing GITHUB_TOKEN or GH_TOKEN.");
  process.exit(1);
}

const { owner, repo } = detectRepo();
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/branches/main/protection`,
  {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "bedrock-agent-bootstrap",
    },
    body: JSON.stringify({
      required_status_checks: {
        strict: true,
        contexts: requiredContexts,
      },
      enforce_admins: false,
      required_pull_request_reviews: {
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        required_approving_review_count: 1,
        require_last_push_approval: false,
      },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
      required_conversation_resolution: true,
      lock_branch: false,
    }),
  }
);

if (!response.ok) {
  const body = await response.text();
  throw new Error(`${response.status} ${response.statusText}: ${body}`);
}

console.log(`Protected ${owner}/${repo} main branch with required checks: ${requiredContexts.join(", ")}`);
