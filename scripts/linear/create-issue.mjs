#!/usr/bin/env node

import process from "node:process";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

const usage = `Usage:
  pnpm linear:create-issue --title "Crash on save" [options]

Options:
  --title <text>          Issue title (required)
  --description <text>    Full issue description
  --expected <text>       Expected behavior
  --actual <text>         Actual behavior
  --repro <text>          Reproduction steps
  --logs <text>           Logs or links to artifacts
  --pr <text>             Linked pull request URL
  --label <text>          Label name (repeatable)
  --team <id>             Override LINEAR_TEAM_ID
  --project <id>          Override LINEAR_PROJECT_ID
`;

const parseArgs = (argv) => {
  const parsed = { labels: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--title":
        parsed.title = next;
        index += 1;
        break;
      case "--description":
        parsed.description = next;
        index += 1;
        break;
      case "--expected":
        parsed.expected = next;
        index += 1;
        break;
      case "--actual":
        parsed.actual = next;
        index += 1;
        break;
      case "--repro":
        parsed.repro = next;
        index += 1;
        break;
      case "--logs":
        parsed.logs = next;
        index += 1;
        break;
      case "--pr":
        parsed.pr = next;
        index += 1;
        break;
      case "--team":
        parsed.teamId = next;
        index += 1;
        break;
      case "--project":
        parsed.projectId = next;
        index += 1;
        break;
      case "--label":
        if (next) {
          parsed.labels.push(next);
        }
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log(usage);
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return parsed;
};

const formatSection = (title, body) => {
  if (!body) {
    return null;
  }
  return `### ${title}\n${body.trim()}`;
};

const buildDescription = (args) => {
  if (args.description) {
    return args.description;
  }

  const sections = [
    formatSection("Reproduction", args.repro),
    formatSection("Expected", args.expected),
    formatSection("Actual", args.actual),
    formatSection("Logs / Artifacts", args.logs),
    formatSection("Linked PR", args.pr),
  ].filter(Boolean);

  return sections.join("\n\n");
};

const graphql = async (query, variables) => {
  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const error = payload.errors?.map((entry) => entry.message).join("; ");
    throw new Error(error || `Linear request failed with status ${response.status}`);
  }
  return payload.data;
};

const ensureLabelIds = async (labelNames) => {
  if (!labelNames.length) {
    return [];
  }

  const data = await graphql(
    `
      query TeamLabels($teamId: String!) {
        issueLabels(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
          }
        }
      }
    `,
    { teamId: process.env.LINEAR_TEAM_ID }
  );

  const labelsByName = new Map(
    data.issueLabels.nodes.map((label) => [label.name.toLowerCase(), label.id])
  );

  return labelNames
    .map((name) => labelsByName.get(name.toLowerCase()) ?? null)
    .filter(Boolean);
};

const args = parseArgs(process.argv.slice(2));
const teamId = args.teamId || process.env.LINEAR_TEAM_ID;
const projectId = args.projectId || process.env.LINEAR_PROJECT_ID || undefined;

if (!process.env.LINEAR_API_KEY) {
  console.error("Missing LINEAR_API_KEY.");
  process.exit(1);
}

if (!teamId) {
  console.error("Missing LINEAR_TEAM_ID or --team.");
  process.exit(1);
}

if (!args.title) {
  console.error("Missing --title.\n");
  console.error(usage);
  process.exit(1);
}

process.env.LINEAR_TEAM_ID = teamId;

const labelIds = await ensureLabelIds(args.labels);
const description = buildDescription(args);

const data = await graphql(
  `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `,
  {
    input: {
      teamId,
      projectId,
      title: args.title,
      description,
      labelIds,
    },
  }
);

if (!data.issueCreate.success || !data.issueCreate.issue) {
  throw new Error("Linear issue creation returned an empty result.");
}

console.log(`${data.issueCreate.issue.identifier} ${data.issueCreate.issue.title}`);
console.log(data.issueCreate.issue.url);
