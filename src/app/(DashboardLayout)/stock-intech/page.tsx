import type { Metadata } from 'next';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { StockIntechOverview } from '../../components/dashboard/StockIntechOverview';
import BreadcrumbComp from '../layout/shared/breadcrumb/BreadcrumbComp';

export const metadata: Metadata = {
    title: 'Stock Intech',
    description: 'Overview of stock intech',
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
        <StaggerContainer className="flex flex-col flex-1 h-full min-h-0">
            <StaggerItem className="shrink-0">
                <BreadcrumbComp title="Stock Intech" items={BCrumb} />
            </StaggerItem>
            <StaggerItem className="flex flex-col flex-1 min-h-0">
                <StockIntechOverview />
            </StaggerItem>
        </StaggerContainer>
    );
};

export default StockIntechPage;
