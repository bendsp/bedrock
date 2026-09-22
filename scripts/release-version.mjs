import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import semver from 'semver';

const tag = process.env.RELEASE_TAG;
const version = tag?.replace(/^v/, '');
if (!version || semver.valid(version) !== version || version.includes('+')) {
  throw new Error('Release must run on a SemVer tag, for example 1.5.0 or v1.5.0-beta.1.');
}
if (process.env.GITHUB_REF_TYPE !== 'tag') throw new Error('Select a tag when running Release manually.');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Building ${tag} as ${version}`);
