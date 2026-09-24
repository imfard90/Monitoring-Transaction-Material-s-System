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
        <>
            <BreadcrumbComp title="Stock Intech" items={BCrumb} />
            <StockIntechOverview />
        </>
    );
};

export default StockIntechPage;
