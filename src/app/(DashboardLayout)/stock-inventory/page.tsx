import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
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
        <StaggerContainer className="flex flex-col flex-1 h-full min-h-0">
            <StaggerItem className="shrink-0">
                <BreadcrumbComp title="Stock Inventory" items={BCrumb} />
            </StaggerItem>
            <StaggerItem className="flex flex-col flex-1 min-h-0">
                <StockBalanceOverview />
            </StaggerItem>
        </StaggerContainer>
    );
}
