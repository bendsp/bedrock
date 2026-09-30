import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { releasePlan } from './release-plan.mjs';
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const repository = 'repos/bendsp/bedrock';
const sha = process.env.GITHUB_SHA;
const tagged = process.env.GITHUB_REF_TYPE === 'tag';
if (!tagged && process.env.GITHUB_REF_NAME !== 'main') throw new Error('Nightlies must build main.');
const releases = JSON.parse(gh('api', `${repository}/releases?per_page=100`));
if (!tagged) releases.push(JSON.parse(gh('api', `${repository}/releases/latest`)));
const plan = releasePlan({ releases, sha, sourceVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
  tag: tagged ? process.env.GITHUB_REF_NAME : null, forced: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch',
  date: new Date().toISOString().slice(0, 10).replaceAll('-', ''), run: process.env.GITHUB_RUN_NUMBER });
const { tag, channel, skip } = plan;
if (!skip && !tagged) {
  const refs = JSON.parse(gh('api', `${repository}/git/matching-refs/tags/${tag}`));
  const ref = refs.find(item => item.ref === `refs/tags/${tag}`);
  if (ref && ref.object.sha !== sha) throw new Error('Existing nightly tag points to another commit.');
  if (!ref) gh('api', '--method', 'POST', `${repository}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sha}`);
  if (!plan.existing) gh('api', '--method', 'POST', `${repository}/releases`, '-f', `tag_name=${tag}`,
    '-f', `target_commitish=${sha}`, '-f', `name=Bedrock Nightly ${tag}`, '-F', 'draft=true', '-F', 'prerelease=true', '-F', 'generate_release_notes=true');
}
for (const [key, value] of Object.entries({ tag, channel, sha, skip: String(skip) })) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
console.log(`${skip ? 'Skipping unchanged' : 'Building'} ${channel} ${tag} at ${sha}`);
