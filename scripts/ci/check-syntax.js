const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const ignoredDirectories = new Set(['.git', 'data', 'node_modules', 'test-results']);
const sourceExtensions = new Set(['.js', '.mjs']);

function collectSources(directory, sources = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) collectSources(entryPath, sources);
            continue;
        }
        if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
            sources.push(entryPath);
        }
    }
    return sources;
}

const sources = collectSources(projectRoot).sort();
for (const source of sources) {
    const result = spawnSync(process.execPath, ['--check', source], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Syntax checked ${sources.length} JavaScript sources.`);
