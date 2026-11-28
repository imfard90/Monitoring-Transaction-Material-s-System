import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getIcon } from '@iconify/react';
import { describe, expect, it } from 'vitest';
import '@/lib/icons/register-icons';

describe('Locally Bundled Icons', () => {
    it('registers essential solar, lucide, mdi, and ri icons into memory storage', () => {
        // Solar icons (sample)
        expect(getIcon('solar:bell-linear')).toBeDefined();
        expect(getIcon('solar:home-2-bold')).toBeDefined();
        expect(getIcon('solar:magnifer-linear')).toBeDefined();
        expect(getIcon('solar:chart-square-bold-duotone')).toBeDefined();
        expect(getIcon('solar:graph-bold')).toBeDefined();
        expect(getIcon('solar:clipboard-list-bold-duotone')).toBeDefined();
        expect(getIcon('solar:pie-chart-2-bold-duotone')).toBeDefined();
        expect(getIcon('solar:ranking-bold')).toBeDefined();

        // Lucide icons (sample)
        expect(getIcon('lucide:shield-check')).toBeDefined();
        expect(getIcon('lucide:database')).toBeDefined();
        expect(getIcon('lucide:key-round')).toBeDefined();
        expect(getIcon('lucide:alert-triangle')).toBeDefined();

        // MDI / RI icons (sample)
        expect(getIcon('mdi:refresh')).toBeDefined();
        expect(getIcon('ri:checkbox-blank-circle-line')).toBeDefined();
    });

    it('each icon contains body svg string without requiring runtime HTTP fetch', () => {
        const bell = getIcon('solar:bell-linear');
        expect(bell?.body).toBeTruthy();
        expect(typeof bell?.body).toBe('string');
        expect(bell?.body.length).toBeGreaterThan(10);
    });

    it('ensures all icons referenced in src/ are bundled locally to prevent CSP violations', () => {
        const rootDir = process.cwd();
        const grepOutput = execSync('git grep -Eoh "(solar|lucide|mdi|ri):[a-zA-Z0-9-]+" src/', {
            cwd: rootDir,
            encoding: 'utf-8',
        });
        const codeIcons = Array.from(new Set(grepOutput.split('\n').filter(Boolean)));

        const bundledPath = path.join(rootDir, 'src', 'lib', 'icons', 'bundled-icons.json');
        const bundled = JSON.parse(fs.readFileSync(bundledPath, 'utf-8')) as Array<{
            prefix: string;
            icons?: Record<string, unknown>;
            aliases?: Record<string, unknown>;
        }>;

        const bundledSet = new Set<string>();
        for (const col of bundled) {
            for (const name of Object.keys(col.icons || {})) {
                bundledSet.add(`${col.prefix}:${name}`);
            }
            for (const alias of Object.keys(col.aliases || {})) {
                bundledSet.add(`${col.prefix}:${alias}`);
            }
        }

        const missing = codeIcons.filter((icon) => !bundledSet.has(icon));
        expect(
            missing,
            `Icons referenced in src/ but missing from bundled-icons.json: ${missing.join(
                ', '
            )}. Run 'pnpm icons:bundle' to bundle them.`
        ).toEqual([]);
    });
});
