import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
async function fixture(fn) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-release-test-'));
  try {
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"bedrock","version":"1.0.0"}');
    await fn(cwd);
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}
function run(script, cwd, env) {
  return spawnSync(process.execPath, [path.join(scripts, script)], {
    cwd, env: { ...process.env, GITHUB_OUTPUT: '', ...env }, encoding: 'utf8',
  });
}
test('version follows a valid tag without changing git state', () => fixture(async cwd => {
  for (const tag of ['1.5.0', 'v1.5.0-beta.1']) {
    const result = run('release-version.mjs', cwd, { RELEASE_TAG: tag, GITHUB_REF_TYPE: 'tag' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await fs.readFile(path.join(cwd, 'package.json'))).version, tag.replace(/^v/, ''));
  }
}));
test('release version rejects branches and malformed tags before writing', () => fixture(async cwd => {
  for (const [tag, type] of [['main', 'branch'], ['1.5.0', 'branch'], ['1.5', 'tag'], ['1.5.0+build', 'tag'], ['$(touch surprise)', 'tag']]) {
    assert.notEqual(run('release-version.mjs', cwd, { RELEASE_TAG: tag, GITHUB_REF_TYPE: type }).status, 0);
    assert.equal(JSON.parse(await fs.readFile(path.join(cwd, 'package.json'))).version, '1.0.0');
  }
}));
test('artifact collection requires a complete set and produces unique DMG names and checksums', () => fixture(async cwd => {
  const source = path.join(cwd, 'out/make');
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, 'Bedrock.dmg'), 'dmg');
  const env = { BUILD_PLATFORM: 'darwin', BUILD_ARCH: 'arm64' };
  assert.notEqual(run('release-artifacts.mjs', cwd, env).status, 0);
  await fs.writeFile(path.join(source, 'Bedrock-darwin-arm64-1.0.0.zip'), 'zip');
  const result = run('release-artifacts.mjs', cwd, env);
  assert.equal(result.status, 0, result.stderr);
  const hashes = await fs.readFile(path.join(cwd, 'release-artifacts/SHA256SUMS-darwin-arm64.txt'), 'utf8');
  assert.match(hashes, /^[a-f0-9]{64}  Bedrock-darwin-arm64-1.0.0.dmg/m);
  assert.equal(hashes.trim().split('\n').length, 2);
}));
test('notarization key accepts wrapped Base64 and rejects malformed secrets', () => fixture(async cwd => {
  const key = '-----BEGIN PRIVATE KEY-----\nfixture-only\n-----END PRIVATE KEY-----\n';
  const encoded = Buffer.from(key).toString('base64');
  const wrapped = `  ${encoded.match(/.{1,20}/g).join('\r\n')}\n`;
  const script = path.join(scripts, 'write-notarization-key.py');
  const invoke = secret => spawnSync('python3', [script], {
    env: { ...process.env, RUNNER_TEMP: cwd, APPLE_API_KEY_P8_BASE64: secret }, encoding: 'utf8',
  });
  for (const value of [encoded, wrapped]) {
    const result = invoke(value);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await fs.readFile(path.join(cwd, 'AuthKey.p8'), 'utf8'), key);
    assert.equal((await fs.stat(path.join(cwd, 'AuthKey.p8'))).mode & 0o777, 0o600);
  }
  for (const value of [encoded + '!', '', Buffer.from('not a PEM key').toString('base64')]) {
    assert.notEqual(invoke(value).status, 0);
    assert.equal(await fs.readFile(path.join(cwd, 'AuthKey.p8'), 'utf8'), key);
  }
}));
