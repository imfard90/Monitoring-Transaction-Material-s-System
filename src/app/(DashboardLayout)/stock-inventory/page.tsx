import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import StockBalanceOverview from '../../components/dashboard/StockBalanceOverview';

export const metadata: Metadata = {
    title: 'Stock Inventory',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Stock Inventory',
    },
];

export default function StockInventoryPage() {
    return (
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0">
                <BreadcrumbComp title="Stock Inventory" items={BCrumb} />
            </div>
            <StockBalanceOverview />
        </div>
    );
}
