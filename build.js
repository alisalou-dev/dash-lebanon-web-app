/*
  build.js — merges the source files (src/) into files ready to deploy.
  Run:  node build.js
  No external libraries needed (Node only).

  Inputs : src/css/*.css and src/js/*.js   (ordered by the number at the start of the name)
  Outputs : css/style.<hash>.css
             js/vendor.<hash>.js   (Supabase library — rarely changes)
             js/app.<hash>.js      (all the site code)
  Then updates index.html between the <!-- build:css --> and <!-- build:js --> markers.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const list = (dir) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => !f.startsWith('.')).sort().map((f) => path.join(dir, f));
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);

// ---- clean old outputs (hashed files only) ----
for (const dir of ['css', 'js']) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (/^(style|vendor|app)\.[0-9a-f]{10}\.(css|js)$/.test(f)) fs.unlinkSync(path.join(ROOT, dir, f));
  }
}

// ---- CSS: safely remove comments and extra spaces ----
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')      // comments
    .replace(/\s+/g, ' ')                  // repeated spaces -> one space
    .replace(/\s*([{};])\s*/g, '$1')       // around { } ;
    .trim();
}
const cssFiles = list('src/css');
const css = cssFiles.map((f) => minifyCss(read(f))).join('\n');
const cssName = `style.${hash(css)}.css`;
fs.writeFileSync(path.join(ROOT, 'css', cssName), css);

// ---- JS: merge only (code is not changed), with a safe separator between files ----
const jsFiles = list('src/js');
const vendorFiles = jsFiles.filter((f) => path.basename(f).startsWith('00-'));
const appFiles = jsFiles.filter((f) => !path.basename(f).startsWith('00-'));
const join = (files) => files.map((f) => `/* ${path.basename(f)} */\n${read(f)}`).join('\n;\n');

const vendor = join(vendorFiles);
const app = join(appFiles);
const vendorName = `vendor.${hash(vendor)}.js`;
const appName = `app.${hash(app)}.js`;
fs.writeFileSync(path.join(ROOT, 'js', vendorName), vendor);
fs.writeFileSync(path.join(ROOT, 'js', appName), app);

// ---- update index.html ----
let html = read('index.html');
const swap = (kind, inner) => {
  const re = new RegExp(`(<!-- build:${kind} -->)[\\s\\S]*?(<!-- /build:${kind} -->)`);
  if (!re.test(html)) throw new Error(`build:${kind} marker not found in index.html`);
  html = html.replace(re, `$1\n${inner}\n$2`);
};
swap('css', `<link rel="stylesheet" href="/css/${cssName}">`);
swap('js', `<script defer src="/js/${vendorName}"></script>\n<script defer src="/js/${appName}"></script>`);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);

const kb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(1) + ' KB';
console.log('OK');
console.log(`  css/${cssName}  ${kb('css/' + cssName)}  (from ${cssFiles.length} files)`);
console.log(`  js/${vendorName}  ${kb('js/' + vendorName)}`);
console.log(`  js/${appName}  ${kb('js/' + appName)}  (from ${appFiles.length} files)`);
