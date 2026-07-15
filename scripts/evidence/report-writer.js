const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function timestampLabel(now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(date.getTime())) throw new Error('Evidence timestamp is invalid.');
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function defaultEvidencePath(label, { now = new Date(), repoRoot = path.resolve(__dirname, '..', '..') } = {}) {
    if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(label)) throw new Error('Evidence report label is invalid.');
    return path.join(repoRoot, 'data', 'evidence', `${label}.${timestampLabel(now)}.json`);
}

function writeJsonEvidence(outputPath, report) {
    const resolved = path.resolve(outputPath);
    if (fs.existsSync(resolved)) throw new Error(`Evidence report already exists: ${resolved}`);
    fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
    const temporary = path.join(
        path.dirname(resolved),
        `.${path.basename(resolved)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    );
    try {
        fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        if (fs.existsSync(resolved)) throw new Error(`Evidence report already exists: ${resolved}`);
        fs.renameSync(temporary, resolved);
        try {
            fs.chmodSync(resolved, 0o600);
        } catch {
            // Windows ACLs do not implement POSIX modes; the parent directory
            // and operator account remain the effective boundary there.
        }
        return resolved;
    } finally {
        try {
            fs.rmSync(temporary, { force: true });
        } catch {
            // Best-effort cleanup after an interrupted/failed replacement.
        }
    }
}

module.exports = { defaultEvidencePath, writeJsonEvidence };
