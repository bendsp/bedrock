import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const platform = process.env.BUILD_PLATFORM, arch = process.env.BUILD_ARCH;
if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Invalid build target.');
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
await fs.mkdir('release-artifacts', { recursive: true });
const hashes = [], found = new Set();
async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await collect(file); continue; }
    if (!entry.isFile() || !/\.(dmg|zip|exe|nupkg)$|^RELEASES$/.test(entry.name)) continue;
    const name = entry.name.endsWith('.dmg') ? `Bedrock-${platform}-${arch}-${version}.dmg` : entry.name;
    if (found.has(name)) throw new Error(`Duplicate artifact: ${name}`);
    found.add(name);
    const bytes = await fs.readFile(file);
    await fs.writeFile(path.join('release-artifacts', name), bytes);
    hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  }
}
await collect('out/make');
const required = platform === 'darwin' ? ['.dmg', '.zip'] : ['-setup.exe'];
for (const suffix of required) if (![...found].some(name => name.endsWith(suffix))) throw new Error(`Missing ${suffix} artifact.`);
const updateAsset = [...found].find(name => name.endsWith(platform === 'darwin' ? '.zip' : '-setup.exe'));
const bytes = await fs.readFile(path.join('release-artifacts', updateAsset));
const sha512 = createHash('sha512').update(bytes).digest('base64');
const metadata = JSON.stringify({ version, files: [{ url: updateAsset, sha512, size: bytes.length }], path: updateAsset, sha512, releaseDate: new Date().toISOString() }, null, 2) + '\n';
const metadataName = `latest-${arch}${platform === 'darwin' ? '-mac' : ''}.yml`;
await fs.writeFile(path.join('release-artifacts', metadataName), metadata);
hashes.push(`${createHash('sha256').update(metadata).digest('hex')}  ${metadataName}`);
await fs.writeFile(`release-artifacts/SHA256SUMS-${platform}-${arch}.txt`, hashes.sort().join('\n') + '\n');
