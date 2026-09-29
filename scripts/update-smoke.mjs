import { spawn, execFileSync } from 'node:child_process';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { extractFile, uncacheAll } from '@electron/asar';
import semver from 'semver';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true' || !process.env.RUNNER_TEMP)
  throw new Error('Installed-app smoke tests require a disposable GitHub runner.');
const platform = process.platform, arch = process.env.BUILD_ARCH;
if (arch !== process.arch) throw new Error(`Native smoke requires a ${arch} runner, got ${process.arch}.`);
if (!['darwin', 'win32'].includes(platform)) throw new Error('Unsupported smoke platform.');
const root = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP, 'bedrock-update-smoke-'));
const userData = path.join(root, 'user-data');
await fs.mkdir(userData);
const originalPackage = await fs.readFile('package.json', 'utf8');
const pkg = JSON.parse(originalPackage);
const originalVersion = pkg.version;
const isNightly = semver.prerelease(originalVersion)?.[0] === 'nightly';
// Both directions use the same source. Only the version changes; signatures stay real.
const stable = isNightly ? `${semver.major(originalVersion)}.${semver.minor(originalVersion)}.${Math.max(0, semver.patch(originalVersion) - 1)}` : originalVersion;
const nightly = isNightly ? originalVersion : `${semver.inc(originalVersion, 'patch')}-nightly.20990101.1`;
const versions = { stable, nightly };
const executable = path.join(root, platform === 'darwin' ? 'Bedrock.app/Contents/MacOS/Bedrock' : 'installed/Bedrock.exe');
const asar = path.join(path.dirname(executable), platform === 'darwin' ? '../Resources/app.asar' : 'resources/app.asar');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', env: process.env });
const pnpm = args => platform === 'win32' ? run('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args]) : run('pnpm', args);
const metadataName = `latest-${arch}${platform === 'darwin' ? '-mac' : ''}.yml`;
const feedFiles = new Map();
async function capture(channel) {
  const version = versions[channel];
  const files = await fs.readdir('release-artifacts');
  const artifact = files.find(file => file.endsWith(platform === 'darwin' ? '.zip' : '-setup.exe'));
  if (!artifact) throw new Error('Missing installer for smoke test.');
  const destination = path.join(root, artifact);
  await fs.copyFile(path.join('release-artifacts', artifact), destination);
  const bytes = await fs.readFile(destination);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  feedFiles.set(`${channel}/${artifact}`, destination);
  const metadata = { version, path: artifact, sha512, files: [{ url: artifact, sha512, size: bytes.length }] };
  feedFiles.set(`${channel}/${metadataName}`, Buffer.from(JSON.stringify(metadata)));
  const release = { tag_name: version, prerelease: channel === 'nightly', draft: false,
    published_at: new Date().toISOString(), assets: [{ name: metadataName }] };
  feedFiles.set(`${channel}/releases.json`, Buffer.from(JSON.stringify(channel === 'stable' ? release : [release])));
  if (channel === 'stable') {
    if (platform === 'darwin') run('ditto', [`out/Bedrock-darwin-${arch}/Bedrock.app`, path.join(root, 'Bedrock.app')]);
    else run(destination, ['/S', `/D=${path.join(root, 'installed')}`]);
  }
}
// Preserve the release artifacts; the auxiliary build must never be uploaded.
const artifactBackup = path.join(root, 'release-artifacts');
await fs.cp('release-artifacts', artifactBackup, { recursive: true });
let server;
try {
  await capture(isNightly ? 'nightly' : 'stable');
  const auxiliary = isNightly ? 'stable' : 'nightly';
  await fs.writeFile('package.json', JSON.stringify({ ...pkg, version: versions[auxiliary] }, null, 2) + '\n');
  pnpm(['exec', 'electron-forge', 'package', `--platform=${platform}`, `--arch=${arch}`]);
  await fs.rm('release-artifacts', { recursive: true });
  await fs.mkdir('release-artifacts');
  if (platform === 'darwin') {
    const app = `out/Bedrock-darwin-${arch}/Bedrock.app`;
    run('codesign', ['--verify', '--deep', '--strict', app]);
    run('xcrun', ['stapler', 'validate', app]);
    run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, `release-artifacts/Bedrock-darwin-${arch}-${versions[auxiliary]}.zip`]);
  } else {
    pnpm(['exec', 'electron-builder', '--prepackaged', 'out/Bedrock-win32-x64', '--win', 'nsis', '--x64', '--config', 'electron-builder.windows.json', '--publish', 'never']);
    const installer = `Bedrock-${versions[auxiliary]}-x64-setup.exe`;
    await fs.copyFile(`out/make/nsis/${installer}`, `release-artifacts/${installer}`);
  }
  await capture(auxiliary);
  const token = randomBytes(24).toString('hex');
  server = createServer(async (request, response) => {
    const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = requestPath.startsWith(`/${token}/`) ? feedFiles.get(requestPath.slice(token.length + 2)) : undefined;
    if (!file) { response.writeHead(404).end(); return; }
    if (Buffer.isBuffer(file)) { response.writeHead(200, { 'Content-Length': file.length }).end(file); return; }
    response.writeHead(200, { 'Content-Length': (await fs.stat(file)).size });
    createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const feed = `http://127.0.0.1:${server.address().port}/${token}/`;
  const note = path.join(userData, 'preserved-note.txt');
  const noteBytes = Buffer.from('\ufeffUnsaved-work protection is tested in Electron UI tests.\r\n');
  await fs.writeFile(note, noteBytes);
  await fs.writeFile(path.join(userData, 'preferences-sentinel.json'), '{"theme":"dark"}\n');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function launch() {
    const log = createWriteStream(path.join(root, 'app.log'), { flags: 'a' });
    const child = spawn(executable, [], { env: { ...process.env, BEDROCK_E2E: '1', BEDROCK_USER_DATA_DIR: userData,
      BEDROCK_UPDATE_SMOKE_FEED: feed }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log); child.stderr.pipe(log);
    child.on('error', error => log.write(String(error)));
    return child;
  }
  async function installedVersion() {
    try { uncacheAll(); return JSON.parse(extractFile(asar, 'package.json').toString()).version; } catch { return null; }
  }
  async function roundTrip(channel) {
    await fs.writeFile(path.join(userData, 'update-smoke-config.json'), JSON.stringify({ channel }));
    launch();
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && await installedVersion() !== versions[channel]) await delay(500);
    if (await installedVersion() !== versions[channel]) throw new Error(`Installed version did not become ${versions[channel]}. See ${root}`);
    // Verify the replacement actually starts and reports its runtime version.
    await delay(3000);
    await fs.writeFile(path.join(userData, 'update-smoke-config.json'), JSON.stringify({ report: true }));
    const child = launch();
    const exit = await Promise.race([new Promise(resolve => child.on('exit', resolve)), delay(20000).then(() => 'timeout')]);
    if (exit !== 0) { child.kill(); throw new Error(`Updated app failed to start: ${exit}`); }
    const states = (await fs.readFile(path.join(userData, 'update-smoke.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    if (!states.some(state => state.pid === child.pid && state.currentVersion === versions[channel])) throw new Error('Runtime version mismatch.');
    if (!noteBytes.equals(await fs.readFile(note))) throw new Error('Update changed note bytes.');
    if (await fs.readFile(path.join(userData, 'preferences-sentinel.json'), 'utf8') !== '{"theme":"dark"}\n') throw new Error('Update changed settings.');
    if (JSON.parse(await fs.readFile(path.join(userData, 'updates.json'), 'utf8')).channel !== channel) throw new Error('Channel preference was lost.');
    console.log(`Installed and launched ${versions[channel]}; documents and preferences preserved.`);
  }
  await roundTrip('nightly');
  await roundTrip('stable');
} finally {
  server?.close();
  await fs.writeFile('package.json', originalPackage);
  await fs.rm('release-artifacts', { recursive: true, force: true });
  await fs.cp(artifactBackup, 'release-artifacts', { recursive: true });
  await fs.mkdir('update-smoke-results', { recursive: true });
  for (const name of ['app.log', 'user-data/update-smoke.jsonl']) {
    await fs.copyFile(path.join(root, name), path.join('update-smoke-results', path.basename(name))).catch(() => undefined);
  }
}
