import type { Metadata } from 'next';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { StockIntechOverview } from '../../components/dashboard/StockIntechOverview';
import BreadcrumbComp from '../layout/shared/breadcrumb/BreadcrumbComp';

export const metadata: Metadata = {
    title: 'Stok Intech',
    description: 'Monitoring stok material integrasi teknisi',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Stock Intech',
    },
];

const StockIntechPage = () => {
    return (
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full h-full min-h-0">
            <StaggerItem className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Stok Intech" items={BCrumb} />
            </StaggerItem>
            <StaggerItem className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-w-full">
                <StockIntechOverview />
            </StaggerItem>
        </StaggerContainer>
    );
};

export default StockIntechPage;
