import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { extractFile } from '@electron/asar';

const expected = process.env.RELEASE_TAG?.replace(/^v/, '');
const platform = process.env.BUILD_PLATFORM, arch = process.env.BUILD_ARCH;
if (!expected || !['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) {
  throw new Error('Provide RELEASE_TAG, BUILD_PLATFORM and BUILD_ARCH.');
}
const directory = path.join('out', `Bedrock-${platform}-${arch}`);
const resources = platform === 'darwin'
  ? path.join(directory, 'Bedrock.app', 'Contents', 'Resources')
  : path.join(directory, 'resources');
const sourceVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const packagedVersion = JSON.parse(extractFile(path.join(resources, 'app.asar'), 'package.json').toString('utf8')).version;
if (sourceVersion !== expected || packagedVersion !== expected) {
  throw new Error(`Version mismatch: tag=${expected}, source=${sourceVersion}, packaged=${packagedVersion}`);
}
if (platform === 'darwin') {
  const plist = path.join(directory, 'Bedrock.app', 'Contents', 'Info.plist');
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    const value = execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
    if (value !== expected) throw new Error(`${key} is ${value}, expected ${expected}`);
  }
}
console.log(`Verified ${platform}/${arch}: source and packaged app are ${expected}`);
