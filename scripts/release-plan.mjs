import semver from 'semver';
const nightly = release => /^v?\d+\.\d+\.\d+-nightly\.\d+\.\d+$/.test(release.tag_name);
export function releasePlan({ releases, sha, sourceVersion, tag, forced, date, run }) {
  if (tag) {
    const version = tag.replace(/^v/, '');
    if (semver.valid(version) !== version || version.includes('+') ||
      (semver.prerelease(version) && !nightly({ tag_name: tag }))) throw new Error('Use a stable SemVer tag or a nightly tag.');
    const existing = releases.find(release => release.tag_name === tag);
    if (existing && !existing.draft) throw new Error('Refusing to modify a published release.');
    return { tag, channel: nightly({ tag_name: tag }) ? 'nightly' : 'stable', skip: false, existing };
  }
  const matching = releases.filter(release => nightly(release) && release.target_commitish === sha);
  const published = matching.find(release => !release.draft);
  if (!forced && published) return { tag: published.tag_name, channel: 'nightly', skip: true };
  // A draft reserves the tag across failed jobs, workflow reruns, and scheduled retries.
  const stableVersions = releases.filter(release => !release.draft && !release.prerelease && semver.valid(release.tag_name)).map(release => semver.clean(release.tag_name));
  const base = [sourceVersion, ...stableVersions].sort(semver.rcompare)[0];
  const generated = `${semver.inc(base, 'patch')}-nightly.${date}.${run}`;
  const existing = releases.find(release => release.tag_name === generated) ?? (!forced && matching.find(release => release.draft));
  if (existing && !existing.draft) return { tag: existing.tag_name, channel: 'nightly', skip: true };
  return { tag: existing?.tag_name ?? generated, channel: 'nightly', skip: false, existing };
}
