export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getStockMovements } from './_actions/movement-actions';
import StockMovementClient from './_components/StockMovementClient';

export const metadata: Metadata = {
    title: 'Stock Movement',
    description: 'Monitor stock movement history',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        to: '/apps',
        title: 'Apps',
    },
    {
        title: 'Stock Movement',
    },
];

export default async function StockMovementPage() {
    const data = await getStockMovements();

    return (
        <>
            <BreadcrumbComp title="Stock Movement" items={BCrumb} />
            <StockMovementClient initialData={data} />
        </>
    );
}
