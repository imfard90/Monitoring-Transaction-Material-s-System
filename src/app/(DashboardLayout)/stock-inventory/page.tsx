import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getPageSessionUser } from '@/lib/auth-server';
import StockBalanceOverview from '../../components/dashboard/StockBalanceOverview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Saldo Stok',
    description: 'Monitoring saldo stok inventaris gudang',
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

export default async function StockInventoryPage() {
    await getPageSessionUser();

    return (
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full h-full min-h-0">
            <StaggerItem className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Saldo Stok" items={BCrumb} />
            </StaggerItem>
            <StaggerItem className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-w-full">
                <StockBalanceOverview />
            </StaggerItem>
        </StaggerContainer>
    );
}
