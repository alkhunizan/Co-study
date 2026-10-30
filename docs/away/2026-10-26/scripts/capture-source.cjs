const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const runtime = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const git = (...args) => execFileSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: runtime, encoding: 'utf8' });
const files = git('ls-files', '-z').split('\0').filter(Boolean).filter(name =>
    !name.startsWith('docs/') && !name.startsWith('design-system/') &&
    /\.(?:[cm]?js|json|html|css|sql|yaml|yml|toml)$/.test(name)).sort();
const entries = files.map(name => ({ path: name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime, name))).digest('hex') }));
const manifest = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
const result = { at: new Date().toISOString(), runtime, head: git('rev-parse', 'HEAD').trim(),
    trackedSourceStatus: git('status', '--porcelain', '--untracked-files=no').split('\n').filter(line => line && !line.slice(3).startsWith('docs/')),
    envFilePresent: fs.existsSync(path.join(runtime, '.env')), files: entries.length, manifest, entries };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ head: result.head, files: result.files, manifest, trackedSourceStatus: result.trackedSourceStatus, envFilePresent: result.envFilePresent }));
