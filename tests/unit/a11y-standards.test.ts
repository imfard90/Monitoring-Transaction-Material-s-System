import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
    let results: string[] = [];
    for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            if (f !== 'node_modules' && f !== '.next' && f !== 'dist') {
                results.push(...walk(full));
            }
        } else if (f.endsWith('.tsx')) {
            results.push(full);
        }
    }
    return results;
}

describe('WCAG 2.1 & 2.2 AA Accessibility Guardrails', () => {
    const tsxFiles = walk('src');

    it('enforces that no element uses a positive tabIndex (> 0)', () => {
        const positiveTabIndexes: string[] = [];
        for (const file of tsxFiles) {
            const content = readFileSync(file, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                if (/tabIndex=\{?[1-9]\d*\}?/i.test(line)) {
                    positiveTabIndexes.push(`${file}:${idx + 1}`);
                }
            });
        }
        expect(positiveTabIndexes).toEqual([]);
    });

    it('enforces that all interactive icon buttons in tables and modals possess accessible names', () => {
        const targetFiles = [
            'src/app/(DashboardLayout)/apps/hasil-rekon/_components/HasilRekonTable.tsx',
            'src/app/(DashboardLayout)/apps/hasil-rekon/_components/EditRekonModal.tsx',
            'src/app/(DashboardLayout)/apps/inout-tag/_components/CreateTagModal.tsx',
            'src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagTable.tsx',
            'src/app/(DashboardLayout)/apps/inout-tag/_components/UpdateTagModal.tsx',
            'src/app/(DashboardLayout)/apps/out-material/_components/OutMaterialTable.tsx',
            'src/app/(DashboardLayout)/apps/stock-movement/_components/MovementTable.tsx',
            'src/app/(DashboardLayout)/form/out-sap/_components/OutSapMaterialList.tsx',
            'src/app/(DashboardLayout)/management/technician/technician-exclude-dialog.tsx',
            'src/app/(DashboardLayout)/management/technician/technician-table.tsx',
        ];

        for (const relPath of targetFiles) {
            const content = readFileSync(join(process.cwd(), relPath), 'utf8');
            expect(content).toContain('aria-label=');
        }
    });

    it('enforces that dashboard layout defines proper semantic landmarks (nav, main, aside)', () => {
        const layoutContent = readFileSync(
            join(process.cwd(), 'src/app/(DashboardLayout)/layout.tsx'),
            'utf8'
        );

        // Skip link inside nav landmark
        expect(layoutContent).toContain('<nav aria-label=');
        // Main landmark with id
        expect(layoutContent).toContain('<main');
        expect(layoutContent).toContain('id="main-content"');
        // Floating support inside aside landmark
        expect(layoutContent).toContain('<aside aria-label=');
        expect(layoutContent).toContain('FloatingSupportWidget');
    });

    it('enforces that auth layout illustration panel is wrapped in an aside landmark', () => {
        const authLayoutContent = readFileSync(
            join(process.cwd(), 'src/app/auth/components/AuthLayout.tsx'),
            'utf8'
        );
        expect(authLayoutContent).toContain('<aside');
        expect(authLayoutContent).toContain('aria-label="Informasi dan Branding MTMS"');
    });

    it('enforces that reference modal dialogs define DialogDescription for screen readers', () => {
        const dialogFiles = [
            'src/app/(DashboardLayout)/reference/out-lensa-ref/_components/OutLensaRefClient.tsx',
            'src/app/(DashboardLayout)/reference/wo-lensa-ref/_components/WOLensaRefClient.tsx',
            'src/app/(DashboardLayout)/reference/stock-comparison/_components/StockComparisonDetailDialog.tsx',
            'src/app/(DashboardLayout)/reference/stock-comparison/_components/StockComparisonLiveDialog.tsx',
            'src/app/(DashboardLayout)/apps/nte-transaction/tag/_components/NteTagClient.tsx',
        ];

        for (const relPath of dialogFiles) {
            const content = readFileSync(join(process.cwd(), relPath), 'utf8');
            expect(content).toContain('DialogDescription');
        }
    });
});
