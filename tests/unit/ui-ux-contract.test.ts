import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * UI/UX consistency contract tests.
 *
 * Guards the invariants the MTMS design system relies on:
 *   - The ui-ux-pro-max skill file exists for design intelligence.
 *   - AGENTS.md establishes UI/UX primitives, theme tokens, and priorities,
 *     keeping authorization and business rules with highest priority.
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

describe('ui-ux-pro-max skill presence', () => {
    it('ships the skill file at the documented path', async () => {
        const content = await readSrc('.agents/skills/ui-ux-pro-max/SKILL.md');
        expect(content).toMatch(/name:\s+ui-ux-pro-max/);
    });

    it('documents comprehensive design system, accessibility, and styling intelligence', async () => {
        const content = await readSrc('.agents/skills/ui-ux-pro-max/SKILL.md');
        expect(content).toMatch(/design system/i);
        expect(content).toMatch(/accessibility/i);
        expect(content).toMatch(/color/i);
        expect(content).toMatch(/typography/i);
    });
});

describe('AGENTS.md integration', () => {
    it('references the UI/UX design intelligence and primitives in the Komponen/UI section', async () => {
        const agents = await readSrc('AGENTS.md');
        expect(agents).toMatch(/ui-ux-pro-max/);
        expect(agents).toMatch(/src\/components\/ui\/\*/);
        expect(agents).toMatch(/--color-primary/);
        // Authorization/business rules must remain authoritative on conflict.
        expect(agents).toMatch(
            /otorisasi.*business rules.*lebih tinggi|otorisasi.*business rules.*prioritas tertinggi/i
        );
    });

    it('extends the Definition of Done with the UI checklist gate', async () => {
        const agents = await readSrc('AGENTS.md');
        expect(agents).toMatch(/checklist UI terpenuhi.*src\/components\/ui\/\*/);
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

describe('shared components premium invariants', () => {
    it('StatusBadge uses semantic tokens, not raw color literals', async () => {
        const src = await readSrc('src/app/components/shared/StatusBadge.tsx');
        // Raw palette literals are forbidden (SKILL §2.1).
        expect(src).not.toMatch(/bg-gray-500/);
        expect(src).not.toMatch(/bg-blue-500/);
        expect(src).not.toMatch(/bg-yellow-500/);
        expect(src).not.toMatch(/bg-green-500/);
        expect(src).not.toMatch(/bg-red-500/);
        // Uses semantic light* variants via mapStatusVariant.
        expect(src).toMatch(/lightInfo|lightWarning|lightSuccess|lightError|lightSecondary/);
        // Accessibility: exposes aria-label and honors reduced motion.
        expect(src).toMatch(/aria-label/);
        expect(src).toMatch(/motion-reduce/);
        // Uses cn util for class merging via mapStatusVariant.
        expect(src).toMatch(/mapStatusVariant/);
    });

    it('EmptyState defaults to Indonesian copy and honors reduced motion', async () => {
        const src = await readSrc('src/app/components/shared/EmptyState.tsx');
        expect(src).toMatch(/Belum ada data/);
        expect(src).toMatch(/text-muted-foreground/);
        expect(src).toMatch(/motion-reduce/);
        expect(src).toMatch(/role="status"/);
    });

    it('ErrorBoundary avoids console.error and offers reload + reset', async () => {
        const src = await readSrc('src/app/components/shared/ErrorBoundary.tsx');
        // No console.error *call* as UI feedback (comments documenting the rule are OK).
        expect(src).not.toMatch(/[^/]\s*console\.error\(/);
        expect(src).toMatch(/onError\?\.?\(/);
        expect(src).toMatch(/Coba lagi/);
        expect(src).toMatch(/Muat ulang halaman/);
        expect(src).toMatch(/window\.location\.reload/);
        expect(src).toMatch(/motion-reduce/);
    });
});

describe('UI primitives premium invariants', () => {
    it('Button honors reduced motion and active scale', async () => {
        const src = await readSrc('src/components/ui/button.tsx');
        expect(src).toMatch(/motion-reduce:transition-none/);
        expect(src).toMatch(/motion-reduce:active:scale-100/);
    });

    it('Skeleton is aria-hidden and honors reduced motion', async () => {
        const src = await readSrc('src/components/ui/skeleton.tsx');
        expect(src).toMatch(/motion-reduce:animate-none/);
        expect(src).toMatch(/aria-hidden/);
    });

    it('Badge uses focus-visible, not focus, and honors reduced motion', async () => {
        const src = await readSrc('src/components/ui/badge.tsx');
        expect(src).toMatch(/focus-visible:ring/);
        expect(src).toMatch(/motion-reduce:transition-none/);
    });
});

describe('DataTable premium invariants', () => {
    it('uses semantic tokens and Indonesian defaults', async () => {
        const src = await readSrc('src/app/components/shared/DataTable.tsx');
        // No raw gray literals (SKILL §2.1).
        expect(src).not.toMatch(/text-gray-\d/);
        expect(src).not.toMatch(/bg-gray-\d/);
        expect(src).not.toMatch(/bg-white(?!\/)/);
        // Uses semantic tokens.
        expect(src).toMatch(/text-muted-foreground/);
        expect(src).toMatch(/bg-background/);
        // Indonesian default copy (SKILL §3.7).
        expect(src).toMatch(/Belum ada data/);
        expect(src).toMatch(/Memuat data/);
        // A11y: role=status + aria-busy + scope=col (SKILL §2.3).
        expect(src).toMatch(/role="status"/);
        expect(src).toMatch(/aria-busy/);
        expect(src).toMatch(/scope="col"/);
        // Motion: honors reduced motion (SKILL §2.4).
        expect(src).toMatch(/motion-reduce/);
    });

    it('DataTablePagination uses Indonesian copy and ARIA labels', async () => {
        const src = await readSrc('src/app/components/shared/DataTablePagination.tsx');
        expect(src).toMatch(/Halaman/);
        expect(src).toMatch(/Sebelumnya/);
        expect(src).toMatch(/Berikutnya/);
        expect(src).toMatch(/<nav|role="navigation"/);
        expect(src).toMatch(/aria-label/);
    });
});

describe('global CSS premium invariants', () => {
    it('globals.css has prefers-reduced-motion and focus-visible', async () => {
        const src = await readSrc('src/app/css/globals.css');
        expect(src).toMatch(/prefers-reduced-motion/);
        expect(src).toMatch(/:focus-visible/);
    });
});

describe('LoadingSkeleton premium invariants', () => {
    it('exposes role=status and aria-label', async () => {
        const src = await readSrc('src/app/components/shared/LoadingSkeleton.tsx');
        expect(src).toMatch(/role="status"/);
        expect(src).toMatch(/aria-label/);
        expect(src).toMatch(/Memuat data/);
    });
});

describe('DateRangePicker premium invariants', () => {
    it('restricts selection to today or earlier (disables future dates after today)', async () => {
        const src = await readSrc('src/app/components/shared/DateRangePicker.tsx');
        expect(src).toMatch(/disabled=\{\{\s*after:\s*new Date\(\)\s*\}\}/);
    });
});
