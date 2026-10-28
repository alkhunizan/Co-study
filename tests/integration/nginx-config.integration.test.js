const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repoRoot } = require('../helpers/test-env');

for (const relativePath of ['nginx.conf', 'scripts/deploy/nginx-halastudy.conf']) {
    test(`${relativePath} enforces the loopback proxy and transport headers`, () => {
        const config = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

        assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
        assert.doesNotMatch(config, /proxy_pass http:\/\/(?!127\.0\.0\.1:3000)/);
        assert.match(config, /location = \/api\/ready\s*\{/);
        assert.match(config, /location \/socket\.io\/\s*\{[\s\S]*proxy_set_header Upgrade \$http_upgrade;/);
        assert.match(config, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
        assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/);
        assert.doesNotMatch(config, /\$proxy_add_x_forwarded_for/);
    });
}
