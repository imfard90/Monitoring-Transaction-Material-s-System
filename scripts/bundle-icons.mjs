import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function bundleIcons() {
    console.log('[bundle-icons] Scanning src/ for icon keys...');
    const grepOutput = execSync('git grep -Eoh "(solar|lucide|mdi|ri):[a-zA-Z0-9-]+" src/', {
        cwd: rootDir,
        encoding: 'utf-8',
    });

    const iconSet = new Set(grepOutput.split('\n').filter(Boolean));
    const grouped = {};

    for (const icon of iconSet) {
        const [prefix, name] = icon.split(':');
        if (!grouped[prefix]) grouped[prefix] = new Set();
        grouped[prefix].add(name);
    }

    const collections = [];
    let totalIcons = 0;

    for (const [prefix, namesSet] of Object.entries(grouped)) {
        const names = Array.from(namesSet).sort();
        console.log(`[bundle-icons] Fetching ${names.length} icons for prefix "${prefix}"...`);
        const url = `https://api.iconify.design/${prefix}.json?icons=${names.join(',')}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch icons for prefix ${prefix}: ${response.statusText}`);
        }
        const json = await response.json();
        const iconCount = Object.keys(json.icons || {}).length;
        totalIcons += iconCount;
        collections.push(json);
    }

    const outputDir = path.join(rootDir, 'src', 'lib', 'icons');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'bundled-icons.json');
    fs.writeFileSync(outputPath, JSON.stringify(collections, null, 2), 'utf-8');

    console.log(
        `[bundle-icons] Successfully bundled ${totalIcons} icons into ${path.relative(rootDir, outputPath)}`
    );
}

bundleIcons().catch((err) => {
    console.error('[bundle-icons] Error:', err);
    process.exit(1);
});

