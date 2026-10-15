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

describe('SearchField clear behavior', () => {
    it('renders a labeled clear button only when a search value is present', async () => {
        const src = await readSrc('src/app/components/shared/SearchField.tsx');
        expect(src).toMatch(/aria-label=\{clearLabel\}/);
        expect(src).toMatch(/onClick=\{\(\) => onValueChange\(''\)\}/);
        expect(src).toMatch(/\{value && \(/);
    });

    it('hides the browser-native search clear affordance when using a custom clear button', async () => {
        const src = await readSrc('src/app/components/shared/SearchField.tsx');
        expect(src).toMatch(/\[&::-webkit-search-cancel-button\]:hidden/);
        expect(src).toMatch(/\[&::-ms-clear\]:hidden/);
    });

    it('technician search matches NIK or name, case-insensitively', async () => {
        const src = await readSrc(
            'src/app/(DashboardLayout)/management/technician/technician-table.tsx'
        );
        expect(src).toMatch(/item\.nik\?\.toLowerCase\(\)\.includes\(search\)/);
        expect(src).toMatch(/item\.name\?\.toLowerCase\(\)\.includes\(search\)/);
        expect(src).toMatch(/Cari berdasarkan NIK atau nama/);
    });

    it('is used by the controlled search fields without changing page filter callbacks', async () => {
        const components = [
            'src/app/components/dashboard/StockBalanceOverview.tsx',
            'src/app/components/dashboard/StockIntechOverview.tsx',
            'src/app/(DashboardLayout)/apps/hasil-rekon/_components/HasilRekonTable.tsx',
            'src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagTable.tsx',
            'src/app/(DashboardLayout)/apps/out-material/_components/OutMaterialTable.tsx',
            'src/app/(DashboardLayout)/apps/stock-movement/_components/MovementTable.tsx',
            'src/app/(DashboardLayout)/management/technician/technician-table.tsx',
            'src/app/(DashboardLayout)/management/users/user-table.tsx',
        ];

        for (const component of components) {
            const src = await readSrc(component);
            expect(src).toMatch(/<SearchField/);
        }
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

    it('Lensa reference routes default server pagination to 20 rows without a URL pageSize', async () => {
        const routes = [
            'src/app/(DashboardLayout)/apps/out-lensa-ref/page.tsx',
            'src/app/(DashboardLayout)/apps/wo-lensa-ref/page.tsx',
        ];

        for (const route of routes) {
            const src = await readSrc(route);
            expect(src).toMatch(/params\.pageSize\s*\?\?\s*'20'/);
        }
    });

    it('DataTablePagination uses Indonesian copy and ARIA labels without persisting page size', async () => {
        const src = await readSrc('src/app/components/shared/DataTablePagination.tsx');
        expect(src).toMatch(/Halaman/);
        expect(src).toMatch(/Sebelumnya/);
        expect(src).toMatch(/Berikutnya/);
        expect(src).toMatch(/<nav|role="navigation"/);
        expect(src).toMatch(/aria-label/);
        expect(src).not.toMatch(/localStorage|mtms_table_page_size/);
        expect(src).not.toMatch(/useEffect/);
        expect(src).toMatch(/table\.setPageSize\(size\)/);
    });

    it('Lensa reference clients use server pagination without competing local pagination state', async () => {
        const outLensa = await readSrc(
            'src/app/(DashboardLayout)/apps/out-lensa-ref/_components/OutLensaRefClient.tsx'
        );
        const woLensa = await readSrc(
            'src/app/(DashboardLayout)/apps/wo-lensa-ref/_components/WOLensaRefClient.tsx'
        );

        for (const src of [outLensa, woLensa]) {
            expect(src).toMatch(/const \[localPagination, setLocalPagination\] = useState/);
            expect(src).toMatch(/manualPagination: !!pagination/);
            expect(src).toMatch(/setLocalPagination\(newState\)/);
            expect(src).toMatch(
                /params\.set\('page', \(newState\.pageIndex \+ 1\)\.toString\(\)\)/
            );
            expect(src).toMatch(/params\.set\('pageSize', newState\.pageSize\.toString\(\)\)/);
            expect(src).not.toMatch(/setPagination\(/);
        }
    });
});

describe('transaction forms & overview pagination invariants', () => {
    it('StockBalanceOverview and StockIntechOverview use DataTablePagination and Indonesian copy', async () => {
        const stockBal = await readSrc('src/app/components/dashboard/StockBalanceOverview.tsx');
        expect(stockBal).toMatch(/DataTablePagination/);
        expect(stockBal).toMatch(/Saldo Stok Real-time/);
        expect(stockBal).toMatch(/Jumlah Stok/);
        expect(stockBal).toMatch(/Estimasi Stok Habis/);
        expect(stockBal).toMatch(/Belum ada data/);
        expect(stockBal).toMatch(/Tidak habis/);
        expect(stockBal).toMatch(/Habis dalam/);
        expect(stockBal).toMatch(/average_demand_weekly/);

        const stockIntech = await readSrc('src/app/components/dashboard/StockIntechOverview.tsx');
        expect(stockIntech).toMatch(/DataTablePagination/);
        expect(stockIntech).toMatch(/Ringkasan Stok Intech/);
        expect(stockIntech).toMatch(/Jumlah Intech/);
    });

    it('management tables use ConfirmDialog and forbid browser-native window.confirm', async () => {
        const userTable = await readSrc(
            'src/app/(DashboardLayout)/management/users/user-table.tsx'
        );
        expect(userTable).toMatch(/ConfirmDialog/);
        expect(userTable).not.toMatch(/window\.confirm/);
        expect(userTable).toMatch(/Hapus Pengguna/);

        const techTable = await readSrc(
            'src/app/(DashboardLayout)/management/technician/technician-table.tsx'
        );
        expect(techTable).not.toMatch(/window\.confirm/);
        expect(techTable).toMatch(/Tambah Teknisi/);
    });
});

describe('dashboard sidebar accessibility invariants', () => {
    it('marks the current sidebar page and labels the mobile navigation dialog in Indonesian', async () => {
        const sidebar = await readSrc('src/app/(DashboardLayout)/layout/sidebar/Sidebar.tsx');
        expect(sidebar).toMatch(/aria-current=\{isSelected \? 'page' : undefined\}/);

        const header = await readSrc('src/app/(DashboardLayout)/layout/header/Header.tsx');
        expect(header).toMatch(/aria-label="Buka menu navigasi"/);
        expect(header).toMatch(/<SheetTitle>Navigasi utama<\/SheetTitle>/);
    });
});

describe('floating support widget invariants', () => {
    it('provides secure external support links and a clear coming-soon agent state', async () => {
        const config = await readSrc('src/components/support/support.config.ts');
        const menu = await readSrc('src/components/support/SupportMenu.tsx');
        const agentPanel = await readSrc('src/components/support/AgentChatPanel.tsx');
        const widget = await readSrc('src/components/support/FloatingSupportWidget.tsx');
        const layout = await readSrc('src/app/(DashboardLayout)/layout.tsx');

        expect(config).toMatch(/https:\/\/wa\.me\/6282334447478/);
        expect(config).toMatch(/https:\/\/t\.me\/imfard/);
        expect(menu.match(/target="_blank"/g)).toHaveLength(2);
        expect(menu.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
        expect(menu).toMatch(/Segera hadir/);
        expect(agentPanel).toMatch(/role="status"/);
        expect(agentPanel).toMatch(/segera tersedia/i);
        expect(widget).toMatch(/aria-label="Buka kanal bantuan"/);
        expect(layout).toMatch(/<FloatingSupportWidget \/>/);
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

describe('auth accessibility & landmark invariants', () => {
    it('AuthLayout contains semantic <main> landmark', async () => {
        const src = await readSrc('src/app/auth/components/AuthLayout.tsx');
        expect(src).toMatch(/<main/);
        expect(src).toMatch(/<\/main>/);
    });

    it('login page checkbox has accessible aria-label and id connection', async () => {
        const src = await readSrc('src/app/auth/login/page.tsx');
        expect(src).toMatch(/aria-label="Ingat perangkat ini"/);
        expect(src).toMatch(/id="remember"/);
        expect(src).toMatch(/htmlFor="remember"/);
    });
});

describe('executive premium localization invariants', () => {
    it('dashboard charts use Indonesian placeholders and labels', async () => {
        const sales = await readSrc('src/app/components/dashboard/SalesOverview.tsx');
        expect(sales).toMatch(/placeholder="Pilih Gudang"/);
        expect(sales).toMatch(/placeholder="Pilih Periode"/);
        expect(sales).toMatch(/Semua Gudang/);

        const outMat = await readSrc('src/app/components/dashboard/OutMaterialLineChart.tsx');
        expect(outMat).toMatch(/placeholder="Pilih Gudang"/);
        expect(outMat).toMatch(/placeholder="Pilih Material"/);
        expect(outMat).toMatch(/10 Material Teratas/);
    });

    it('dashboard carousel and tables use Indonesian copy', async () => {
        const carousel = await readSrc('src/app/components/dashboard/TopCardsCarousel.tsx');
        expect(carousel).toMatch(/Pengguna Online/);
        expect(carousel).toMatch(/Permintaan Tag/);
        expect(carousel).toMatch(/Retur Teknisi/);

        const warning = await readSrc('src/app/components/dashboard/StockWarningTable.tsx');
        expect(warning).toMatch(/Peringatan Stok Minimum/);
        expect(warning).toMatch(/Kode Material/);
        expect(warning).toMatch(/Stok Saat Ini/);

        const perf = await readSrc('src/app/components/dashboard/ProductPerformance.tsx');
        expect(perf).toMatch(/Performa Pengeluaran Gudang/);
        expect(perf).toMatch(/Nama Gudang/);
        expect(perf).toMatch(/Persentase/);
    });

    it('transaction tables use Indonesian search and filter placeholders', async () => {
        const tag = await readSrc(
            'src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagTable.tsx'
        );
        expect(tag).toMatch(/placeholder="Cari ID permintaan/);

        const out = await readSrc(
            'src/app/(DashboardLayout)/apps/out-material/_components/OutMaterialTable.tsx'
        );
        expect(out).toMatch(/placeholder="Cari ID permintaan/);

        const move = await readSrc(
            'src/app/(DashboardLayout)/apps/stock-movement/_components/MovementTable.tsx'
        );
        expect(move).toMatch(/Semua Gudang/);
        expect(move).toMatch(/Semua Material/);

        const rekon = await readSrc(
            'src/app/(DashboardLayout)/apps/hasil-rekon/_components/HasilRekonTable.tsx'
        );
        expect(rekon).toMatch(/Semua Gudang/);
        expect(rekon).toMatch(/Semua Tipe/);
        expect(rekon).toMatch(/Semua Material/);
    });

    describe('dialog & loading feedback consistency invariants', () => {
        it('UpdateTagModal uses ConfirmDialog and avoids window.confirm', async () => {
            const modal = await readSrc(
                'src/app/(DashboardLayout)/apps/inout-tag/_components/UpdateTagModal.tsx'
            );
            expect(modal).toMatch(/ConfirmDialog/);
            expect(modal).not.toMatch(/window\.confirm/);
            expect(modal).toMatch(/Batalkan Transaksi Tag/);
        });

        it('ConfirmDialog uses semantic theme tokens and avoids raw slate background', async () => {
            const dialog = await readSrc('src/app/components/shared/ConfirmDialog.tsx');
            expect(dialog).not.toMatch(/bg-slate-\d/);
            expect(dialog).toMatch(/bg-muted/);
            expect(dialog).toMatch(/Memproses\.\.\./);
            expect(dialog).not.toMatch(/Submitting\.\.\./);
            expect(dialog).toMatch(/variant\?:\s*'default'\s*\|\s*'destructive'/);
        });

        it('UpdateTagModal marks destructive confirmation with destructive variant', async () => {
            const modal = await readSrc(
                'src/app/(DashboardLayout)/apps/inout-tag/_components/UpdateTagModal.tsx'
            );
            expect(modal).toMatch(/variant="destructive"/);
        });

        it('LoadingOverlay has accessibility landmarks and uses semantic primary token', async () => {
            const overlay = await readSrc('src/app/components/shared/LoadingOverlay.tsx');
            expect(overlay).toMatch(/role="status"/);
            expect(overlay).toMatch(/aria-live="polite"/);
            expect(overlay).toMatch(/text-primary/);
            expect(overlay).not.toMatch(/text-blue-500/);
        });

        it('CreateTagModal is fully localized and avoids leftover English button strings', async () => {
            const modal = await readSrc(
                'src/app/(DashboardLayout)/apps/inout-tag/_components/CreateTagModal.tsx'
            );
            expect(modal).toMatch(/Batal/);
            expect(modal).toMatch(/Simpan Tag/);
            expect(modal).toMatch(/Menyimpan\.\.\./);
            expect(modal).toMatch(/Gudang Asal/);
            expect(modal).toMatch(/Gudang Tujuan/);
            expect(modal).toMatch(/Daftar Material/);
            expect(modal).toMatch(/Tambah Material/);
            expect(modal).not.toMatch(/>\s*Cancel\s*</);
            expect(modal).not.toMatch(/>\s*Save Tag\s*</);
        });

        it('Detail modals avoid English fallback text for empty lists', async () => {
            const inoutDetail = await readSrc(
                'src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagDetailModal.tsx'
            );
            expect(inoutDetail).toMatch(/Tidak ada item untuk status tag ini\./);
            expect(inoutDetail).not.toMatch(/No items found/);

            const outMaterialDetail = await readSrc(
                'src/app/(DashboardLayout)/apps/out-material/_components/OutMaterialDetailModal.tsx'
            );
            expect(outMaterialDetail).toMatch(/Tidak ada item yang ditemukan/);
            expect(outMaterialDetail).not.toMatch(/No items found/);
        });

        it('HasilRekonTable and InOutTagTable use semantic primary tokens instead of raw blue utility colors', async () => {
            const rekonTable = await readSrc(
                'src/app/(DashboardLayout)/apps/hasil-rekon/_components/HasilRekonTable.tsx'
            );
            expect(rekonTable).not.toMatch(/text-blue-600/);
            expect(rekonTable).toMatch(/text-primary/);

            const tagTable = await readSrc(
                'src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagTable.tsx'
            );
            expect(tagTable).not.toMatch(/text-blue-600/);
            expect(tagTable).toMatch(/text-primary/);
            expect(tagTable).toMatch(/Perbarui Tag/);
        });

        it('DataTablePagination provides full accessible labels, titles, and screen reader announcements', async () => {
            const pagination = await readSrc('src/app/components/shared/DataTablePagination.tsx');
            expect(pagination).toMatch(/aria-label="Halaman pertama"/);
            expect(pagination).toMatch(/aria-label="Sebelumnya"/);
            expect(pagination).toMatch(/aria-label="Berikutnya"/);
            expect(pagination).toMatch(/aria-label="Halaman terakhir"/);
            expect(pagination).toMatch(/aria-label="Pilih jumlah baris per halaman"/);
            expect(pagination).toMatch(/<span className="sr-only">Halaman pertama<\/span>/);
            expect(pagination).toMatch(/<span className="sr-only">Halaman terakhir<\/span>/);
        });

        it('Reference scraping pages localize actions and modal titles in Indonesian', async () => {
            const outLensa = await readSrc(
                'src/app/(DashboardLayout)/apps/out-lensa-ref/_components/OutLensaRefClient.tsx'
            );
            expect(outLensa).toMatch(/Jalankan Scraping/);
            expect(outLensa).not.toMatch(/>\s*Run Scraping\s*</);
            expect(outLensa).toMatch(/Detail Reservasi Material/);

            const woLensa = await readSrc(
                'src/app/(DashboardLayout)/apps/wo-lensa-ref/_components/WOLensaRefClient.tsx'
            );
            expect(woLensa).toMatch(/Jalankan Scraping/);
            expect(woLensa).not.toMatch(/>\s*Run Scraping\s*</);
            expect(woLensa).toMatch(/Detail Material WO Lensa/);
            expect(woLensa).toMatch(/Nomor WO:/);
            expect(woLensa).toMatch(/Nomor GI:/);
        });
    });
});
