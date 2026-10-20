const fs = require('node:fs/promises');
const path = require('node:path');
const { createDatabase } = require('../services/platform/database');
const { backupDatabase, restoreDatabase } = require('../services/platform/maintenance');

// Offline tool. Credentials are read only from the process environment.
// Examples: npm run platform:backup -- --directory <db> --file <snapshot>
//           npm run platform:restore -- --directory <EMPTY-db> --file <snapshot>
async function main() {
    const [command, ...args] = process.argv.slice(2);
    const option = (name) => {
        const index = args.indexOf(`--${name}`);
        return index >= 0 ? args[index + 1] : null;
    };
    if (!['backup', 'restore', 'migrate'].includes(command)) throw new Error('Use backup, restore, or migrate.');
    const directory = option('directory') || process.env.PLATFORM_DATA_DIR;
    const url = process.env.PLATFORM_DATABASE_URL || '';
    const file = option('file');
    if (!directory && !url) throw new Error('Specify --directory or PLATFORM_DATABASE_URL explicitly.');
    if (command !== 'migrate' && !file) throw new Error('Specify --file inside the dedicated backup folder.');
    const db = await createDatabase({ url, directory, migrate: command === 'migrate' });
    try {
        if (command === 'backup') await backupDatabase(db, path.resolve(file));
        if (command === 'restore') await restoreDatabase(db, JSON.parse(await fs.readFile(path.resolve(file), 'utf8')));
        console.log(`Platform ${command} completed.`);
    } finally {
        await db.close();
    }
}
void main().catch((error) => { console.error(error.message); process.exitCode = 1; });
