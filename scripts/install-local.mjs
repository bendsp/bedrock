import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = 'com.electron.bedrock.dev';
const applications = path.join(os.homedir(), 'Applications');
const target = path.join(applications, 'Bedrock Dev.app');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
};
const exists = async (file) => {
  try { await fs.lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
async function verify(bundle) {
  if ((await fs.lstat(bundle)).isSymbolicLink()) throw new Error('Refusing to replace a symlink.');
  const bundleId = execFileSync('/usr/libexec/PlistBuddy', [
    '-c', 'Print :CFBundleIdentifier', path.join(bundle, 'Contents/Info.plist'),
  ], { encoding: 'utf8' }).trim();
  if (bundleId !== id) throw new Error(`Refusing to replace bundle ${bundleId}.`);
}
function running(quit = false) {
  // NSRunningApplication addresses only this bundle ID, never an app by display name.
  return JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', `
    ObjC.import('AppKit');
    const apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier('${id}');
    ${quit ? 'for (let i = 0; i < apps.count; i++) apps.objectAtIndex(i).terminate;' : ''}
    JSON.stringify(Number(apps.count));
  `], { encoding: 'utf8' }).trim());
}

if (process.platform !== 'darwin') throw new Error('install:local currently supports macOS.');
await fs.mkdir(applications, { recursive: true });
const lock = path.join(applications, '.bedrock-dev-install.lock');
await fs.mkdir(lock).catch(() => { throw new Error(`Another install may be running. Check ${lock}.`); });
let work, packageTemp, stage, backup;
try {
  if (await exists(target)) await verify(target);
  run('pnpm', ['install', '--frozen-lockfile']);
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-local-'));
  packageTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-package-'));
  // Include current tracked edits and non-ignored new files, without sharing build output.
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    const source = path.join(root, file);
    if (!await exists(source)) continue;
    const destination = path.join(work, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  await fs.symlink(path.join(root, 'node_modules'), path.join(work, 'node_modules'), 'dir');
  run('pnpm', ['exec', 'electron-forge', 'package', '--platform=darwin', `--arch=${process.arch}`], {
    cwd: work, env: { ...process.env, TMPDIR: packageTemp, BEDROCK_LOCAL_BUILD: '1', BEDROCK_RELEASE: '0' },
  });
  const bundle = path.join(work, 'out', `Bedrock Dev-darwin-${process.arch}`, 'Bedrock Dev.app');
  await verify(bundle);
  // A local ad-hoc signature needs no Apple credentials or notarization service.
  run('codesign', ['--force', '--deep', '--sign', '-', bundle]);
  run('codesign', ['--verify', '--deep', '--strict', bundle]);
  stage = await fs.mkdtemp(path.join(applications, '.bedrock-dev-stage-'));
  const stagedBundle = path.join(stage, 'Bedrock Dev.app');
  run('ditto', [bundle, stagedBundle]);
  await verify(stagedBundle);
  run('codesign', ['--verify', '--deep', '--strict', stagedBundle]);
  if (running()) {
    console.log('Quit requested for Bedrock Dev. Save or discard any pending edits.');
    running(true);
    const deadline = Date.now() + 60_000;
    while (running()) {
      if (Date.now() > deadline) throw new Error('Bedrock Dev is still running. Installation cancelled.');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (await exists(target)) {
    await verify(target);
    backup = path.join(stage, 'previous.app');
    await fs.rename(target, backup);
  }
  try {
    await fs.rename(stagedBundle, target);
  } catch (error) {
    if (backup) { await fs.rename(backup, target); backup = undefined; }
    throw error;
  }
  // Keep the previous bundle until the new installation can be launched.
  try { run('open', [target]); }
  catch (error) {
    await fs.rename(target, stagedBundle);
    if (backup) { await fs.rename(backup, target); backup = undefined; }
    throw error;
  }
  backup = undefined;
  console.log(`Installed ${target}. Production Bedrock was not changed.`);
} finally {
  if (packageTemp) await fs.rm(packageTemp, { recursive: true, force: true });
  if (work && process.env.BEDROCK_KEEP_LOCAL_BUILD === '1') console.log(`Build retained at ${work}`);
  else if (work) await fs.rm(work, { recursive: true, force: true });
  // Retain a backup if rollback itself failed, so it can be recovered manually.
  if (stage && !backup) await fs.rm(stage, { recursive: true, force: true });
  if (backup) console.error(`Previous installation retained at ${backup}`);
  await fs.rmdir(lock);
}
