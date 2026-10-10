import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * UI/UX consistency contract tests.
 *
 * Guards the invariants the premium-ui-ux-builder skill relies on:
 *   - The skill file exists at the documented path.
 *   - AGENTS.md references the skill and keeps authorization priority.
 *   - The button primitive contract (CVA variants, sizes, a11y, motion)
 *     stays stable so domain components can keep composing it instead
 *     of duplicating. Asserted via source-text to stay dependency-free
 *     under the existing node-based vitest harness (P1-Q1).
 *   - The `cn` util still merges classes and resolves Tailwind conflicts.
 *
 * No DOM/visual library is required, keeping the test fast and
 * dependency-free. When Storybook/visual testing is added later, extend
 * this file (or add tests/visual/) with component render assertions.
 */

const repoRoot = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFile(resolve(repoRoot, rel), 'utf8');

describe('premium-ui-ux-builder skill presence', () => {
    it('ships the skill file at the documented path', async () => {
        const content = await readSrc(
            '.agents/skills/premium-ui-ux-builder/SKILL.md',
        );
        expect(content).toMatch(/name:\s+premium-ui-ux-builder/);
        expect(content).toMatch(/Premium UI\/UX Builder — MTMS/);
    });

    it('documents the reuse-first and token-based design rules', async () => {
        const content = await readSrc(
            '.agents/skills/premium-ui-ux-builder/SKILL.md',
        );
        expect(content).toMatch(/src\/components\/ui\/\*/);
        expect(content).toMatch(/--color-primary/);
        expect(content).toMatch(/focus-visible/);
        expect(content).toMatch(/prefers-reduced-motion/);
        expect(content).toMatch(/empty/);
    });
});

describe('AGENTS.md integration', () => {
    it('references the skill in the Komponen/UI section', async () => {
        const agents = await readSrc('AGENTS.md');
        expect(agents).toMatch(
            /\.agents\/skills\/premium-ui-ux-builder\/SKILL\.md/,
        );
        // Authorization/business rules must remain authoritative on conflict.
        expect(agents).toMatch(/otorisasi.*business rules.*lebih tinggi/i);
    });

    it('extends the Definition of Done with the UI checklist gate', async () => {
        const agents = await readSrc('AGENTS.md');
        expect(agents).toMatch(/premium-ui-ux-builder\/SKILL\.md` §4/);
    });
});

describe('button primitive contract (CVA)', () => {
    it('keeps the core variants, sizes, a11y, and motion the skill depends on', async () => {
        const src = await readSrc('src/components/ui/button.tsx');
        // Export contract.
        expect(src).toMatch(/export\s*\{\s*Button,\s*buttonVariants\s*\}/);
        // A11y + premium motion anchors referenced by the skill.
        expect(src).toMatch(/rounded-xl/);
        expect(src).toMatch(/focus-visible:ring/);
        expect(src).toMatch(/active:scale-\[0\.98\]/);
        // Semantic status variants used across the app.
        expect(src).toMatch(/destructive/);
        expect(src).toMatch(/outline/);
        // Sizes the skill relies on for density control.
        expect(src).toMatch(/h-9/); // sm
        expect(src).toMatch(/w-10/); // icon
    });
});

describe('cn util contract', () => {
    it('merges classes and resolves Tailwind conflicts', async () => {
        const { cn } = await import('@/lib/utils');
        expect(cn('px-2', 'px-4')).toBe('px-4');
        expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
    });
});
