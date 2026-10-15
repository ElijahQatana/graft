// Runs from the npm "version" script. Copies the new package version into
// manifest.json and versions.json so the three files cannot drift.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env.npm_package_version;
if (!version) {
  console.error('Run this through "npm version", which sets npm_package_version.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

manifest.version = version;
versions[version] = manifest.minAppVersion;

writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync('versions.json', JSON.stringify(versions, null, 2) + '\n');
