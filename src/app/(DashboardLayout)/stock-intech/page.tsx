import type { Metadata } from 'next';
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
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0">
                <BreadcrumbComp title="Stock Intech" items={BCrumb} />
            </div>
            <StockIntechOverview />
        </div>
    );
};

export default StockIntechPage;
