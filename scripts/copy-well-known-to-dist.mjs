import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'well-known', '.well-known');
const outDir = path.join(root, 'dist', '.well-known');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(srcDir)) {
  console.log('[well-known] No source directory found:', srcDir);
  process.exit(0);
}

if (!fs.existsSync(path.join(root, 'dist'))) {
  console.error('[well-known] dist/ not found. Run `expo export --platform web --output-dir dist` first.');
  process.exit(1);
}

const files = fs.readdirSync(srcDir);
for (const f of files) {
  const src = path.join(srcDir, f);
  const dest = path.join(outDir, f);
  if (fs.statSync(src).isFile()) {
    copyFile(src, dest);
    console.log('[well-known] Copied', path.relative(root, src), '->', path.relative(root, dest));
  }
}

