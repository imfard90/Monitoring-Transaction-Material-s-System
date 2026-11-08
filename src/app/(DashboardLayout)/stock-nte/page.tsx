import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getNteStock } from '../_actions/nte-stock-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
    title: 'Stock NTE | MTMS',
    description: 'Ringkasan stok NTE tersedia per gudang.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StockNtePage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const rawPage = typeof params.page === 'string' ? Number(params.page) : 1;
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const result = await getNteStock(page);
    const rows = result.success ? result.rows : [];
    const total = result.success ? result.total : 0;
    const pageCount = Math.max(1, Math.ceil(total / 50));

    return (
        <div className="flex flex-col gap-4">
            <BreadcrumbComp
                title="Stock NTE"
                items={[{ to: '/', title: 'Beranda' }, { title: 'Stock NTE' }]}
            />
            <Card className="overflow-hidden border-border/70 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
                    <div>
                        <CardTitle className="text-lg">Ringkasan stok tersedia</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Jumlah SN berstatus tersedia, dikelompokkan per lokasi dan model.
                        </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                        {total.toLocaleString('id-ID')} baris
                    </span>
                </CardHeader>
                <CardContent className="p-0">
                    {result.success ? (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-left text-sm">
                                <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        {[
                                            'BRANCH',
                                            'GUDANG',
                                            'OWNER',
                                            'TYPE',
                                            'MEREK',
                                            'TYPE SN',
                                            'JUMLAH',
                                        ].map((heading) => (
                                            <th
                                                key={heading}
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length ? (
                                        rows.map((row) => (
                                            <tr
                                                key={`${row.branch}-${row.gudang}-${row.owner}-${row.type}-${row.merek}-${row.type_sn}`}
                                                className="border-t border-border/70 hover:bg-muted/40"
                                            >
                                                <td className="px-4 py-3">{row.branch}</td>
                                                <td className="px-4 py-3 font-medium text-foreground">
                                                    {row.gudang}
                                                </td>
                                                <td className="px-4 py-3 uppercase">{row.owner}</td>
                                                <td className="px-4 py-3">{row.type}</td>
                                                <td className="px-4 py-3">{row.merek}</td>
                                                <td className="px-4 py-3">{row.type_sn}</td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    {row.jumlah.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="px-4 py-12 text-center text-muted-foreground"
                                            >
                                                Belum ada stok NTE tersedia untuk gudang yang dapat
                                                diakses.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p role="alert" className="px-5 py-8 text-sm text-destructive">
                            {result.error}
                        </p>
                    )}
                    <nav
                        aria-label="Navigasi halaman stok NTE"
                        className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground"
                    >
                        <span>
                            Halaman {page} dari {pageCount}
                        </span>
                        <div className="flex gap-2">
                            <a
                                aria-disabled={page <= 1}
                                className={`rounded-md border px-3 py-1.5 ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-muted'}`}
                                href={`/stock-nte?page=${page - 1}`}
                            >
                                Sebelumnya
                            </a>
                            <a
                                aria-disabled={page >= pageCount}
                                className={`rounded-md border px-3 py-1.5 ${page >= pageCount ? 'pointer-events-none opacity-50' : 'hover:bg-muted'}`}
                                href={`/stock-nte?page=${page + 1}`}
                            >
                                Berikutnya
                            </a>
                        </div>
                    </nav>
                </CardContent>
            </Card>
        </div>
    );
}
