#!/usr/bin/env node

import { execSync } from "node:child_process";
import process from "node:process";

const labels = [
  {
    name: "agent",
    color: "1d76db",
    description: "Work discovered or prepared by an autonomous agent",
  },
  {
    name: "feature",
    color: "0e8a16",
    description: "New user-facing capability",
  },
  {
    name: "bug",
    color: "d73a4a",
    description: "Behavioral defect or regression",
  },
  {
    name: "needs-human-review",
    color: "fbca04",
    description: "Ready for human review or product decision",
  },
];

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
const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

const request = async (pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "bedrock-agent-bootstrap",
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response.status === 204 ? null : response.json();
};

for (const label of labels) {
  const existing = await request(`/labels/${encodeURIComponent(label.name)}`);

  if (existing) {
    await request(`/labels/${encodeURIComponent(label.name)}`, {
      method: "PATCH",
      body: JSON.stringify(label),
    });
    console.log(`updated ${label.name}`);
  } else {
    await request("/labels", {
      method: "POST",
      body: JSON.stringify(label),
    });
    console.log(`created ${label.name}`);
  }
}
