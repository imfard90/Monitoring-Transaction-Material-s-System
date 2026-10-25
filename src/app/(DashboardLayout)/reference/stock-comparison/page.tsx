import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { getTeknisiStockList } from '../_actions/stock-comparison-actions';
import StockComparisonTableView from './_components/StockComparisonTableView';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Intech Lensa vs MTMS | MTMS',
    description: 'Bandingkan stok material teknisi dari Intech Lensa dengan data MTMS',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        to: '/reference',
        title: 'Reference',
    },
    {
        title: 'Intech Lensa vs MTMS',
    },
];

export default async function StockComparisonPage() {
    const user = await getSessionUser();
    const result = await getTeknisiStockList();

    return (
        <main className="flex flex-col gap-4 p-4 md:p-6 md:h-full md:min-h-0 md:overflow-hidden">
            <BreadcrumbComp title="Intech Lensa vs MTMS" items={BCrumb} />
            <StockComparisonTableView
                initialData={result.data ?? []}
                initialError={result.error}
                isStaff={user.isStaff}
            />
        </main>
    );
}
