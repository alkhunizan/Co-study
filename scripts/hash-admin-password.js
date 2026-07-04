#!/usr/bin/env node
// Generates the ADMIN_PASSWORD_HASH value for .env.
// Usage: npm run admin:hash -- "your-admin-password"

const { hashPassword } = require('../services/auth/password');

const MIN_LENGTH = 8;

async function main() {
    const password = process.argv[2];
    if (!password || password.length < MIN_LENGTH) {
        console.error(`Usage: node scripts/hash-admin-password.js <password (min ${MIN_LENGTH} chars)>`);
        process.exitCode = 1;
        return;
    }
    const hash = await hashPassword(password);
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
});
