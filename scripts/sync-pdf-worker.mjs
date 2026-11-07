import * as fs from 'node:fs';
import * as path from 'node:path';

const src = path.resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const dest = path.resolve('public/pdf.worker.min.mjs');

if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('✓ Synchronized pdf.worker.min.mjs to public/ directory');
} else {
    console.warn('⚠️  pdfjs-dist worker not found in node_modules, skipping sync.');
}

