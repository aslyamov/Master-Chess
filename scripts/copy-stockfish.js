import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const publicDir = resolve(root, 'public');
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

// Files live in node_modules/stockfish/bin/
const sfDir = resolve(root, 'node_modules', 'stockfish', 'bin');
const sfRoot = resolve(root, 'node_modules', 'stockfish');

if (!existsSync(sfRoot)) {
  console.log('stockfish not installed yet — skipping copy');
  process.exit(0);
}

// Use lite variant only — sufficient for depth 10-22, loads faster (~7 MB vs ~107 MB)
const candidates = [
  'stockfish-18-lite.js',
  'stockfish-18-lite.wasm',
];

for (const file of candidates) {
  // Check in bin/ first, then root
  const src = existsSync(resolve(sfDir, file)) ? resolve(sfDir, file) : resolve(sfRoot, file);
  if (existsSync(src)) {
    copyFileSync(src, resolve(publicDir, file));
    console.log(`Copied ${file} → public/`);
  }
}
