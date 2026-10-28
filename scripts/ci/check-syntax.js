const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(process.env.CHECK_SYNTAX_ROOT || path.join(__dirname, '..', '..'));
const ignoredDirectories = new Set(['.git', 'data', 'node_modules', 'output', 'playwright-report', 'test-results']);
const sourceExtensions = new Set(['.js', '.mjs']);
// Inline <script> types that hold JavaScript; JSON-LD is parsed as JSON. Anything
// else (e.g. text/babel mock-ups) is not executed by browsers as-is and is skipped.
const classicScriptTypes = new Set(['', 'text/javascript', 'application/javascript']);

function collectFiles(directory, extensions, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) collectFiles(entryPath, extensions, files);
            continue;
        }
        if (entry.isFile() && extensions.has(path.extname(entry.name))) {
            files.push(entryPath);
        }
    }
    return files;
}

/**
 * Inline scripts of an HTML document, each with the 1-based line it starts on.
 * @param {string} html
 */
function extractInlineScripts(html) {
    const scripts = [];
    const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    for (const match of html.matchAll(pattern)) {
        const attributes = match[1];
        const body = match[2];
        if (/\bsrc\s*=/i.test(attributes) || !body.trim()) continue;
        const typeMatch = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
        const type = typeMatch ? typeMatch[1].toLowerCase() : '';
        const bodyOffset = (match.index ?? 0) + match[0].indexOf('>') + 1;
        const line = html.slice(0, bodyOffset).split('\n').length;
        scripts.push({ type, body, line });
    }
    return scripts;
}

/**
 * Syntax-checks one HTML file's inline scripts. Returns a list of error messages.
 * @param {string} file
 */
function checkHtmlFile(file) {
    const errors = [];
    const relative = path.relative(projectRoot, file);
    for (const [index, script] of extractInlineScripts(fs.readFileSync(file, 'utf8')).entries()) {
        const label = `${relative} inline script #${index + 1} (line ${script.line})`;
        if (script.type === 'application/ld+json') {
            try {
                JSON.parse(script.body);
            } catch (error) {
                errors.push(`${label}: invalid JSON-LD: ${/** @type {Error} */ (error).message}`);
            }
            continue;
        }
        const isModule = script.type === 'module';
        if (!isModule && !classicScriptTypes.has(script.type)) continue;
        // Pad with blank lines so reported line numbers match the HTML file.
        const source = `${'\n'.repeat(script.line - 1)}${script.body}`;
        const tempFile = path.join(os.tmpdir(), `halastudy-inline-${process.pid}-${index}${isModule ? '.mjs' : '.js'}`);
        fs.writeFileSync(tempFile, source);
        try {
            const result = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
            if (result.status !== 0) {
                errors.push(`${label}:\n${String(result.stderr).split(tempFile).join(relative)}`);
            }
        } finally {
            fs.rmSync(tempFile, { force: true });
        }
    }
    return errors;
}

function main() {
    const sources = collectFiles(projectRoot, sourceExtensions).sort();
    for (const source of sources) {
        const result = spawnSync(process.execPath, ['--check', source], { stdio: 'inherit' });
        if (result.status !== 0) process.exit(result.status || 1);
    }

    const pages = collectFiles(projectRoot, new Set(['.html'])).sort();
    const pageErrors = pages.flatMap((page) => checkHtmlFile(page));
    if (pageErrors.length) {
        for (const error of pageErrors) console.error(error);
        process.exit(1);
    }

    console.log(`Syntax checked ${sources.length} JavaScript sources and inline scripts in ${pages.length} HTML pages.`);
}

if (require.main === module) main();

module.exports = { checkHtmlFile, extractInlineScripts };
