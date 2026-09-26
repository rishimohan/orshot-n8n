// Fails the build (and therefore `npm publish`) when the compiled node or
// credential files are missing from dist/.
//
// Why: 0.6.0-0.6.2 were published with only the SVG icons. `npm publish`
// runs prepublishOnly, which rebuilt after rimraf'ing dist, and tsc's
// incremental cache (.tsbuildinfo, kept outside dist) said "up to date" so
// nothing was emitted. n8n's review rejected the update ("doesn't actually
// contain any code just the icons").
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const required = [...(pkg.n8n.nodes || []), ...(pkg.n8n.credentials || [])];

const missing = required.filter((file) => {
	const full = path.join(__dirname, '..', file);
	return !fs.existsSync(full) || fs.statSync(full).size === 0;
});

if (missing.length) {
	console.error(`verify-dist: missing compiled files: ${missing.join(', ')}`);
	process.exit(1);
}

console.log(`verify-dist: ok (${required.length} files)`);
