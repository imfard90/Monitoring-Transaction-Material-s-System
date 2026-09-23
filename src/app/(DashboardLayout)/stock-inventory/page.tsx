import type { Metadata } from 'next';
import React from 'react';
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
        <>
            <BreadcrumbComp title="Stock Inventory" items={BCrumb} />
            <StockBalanceOverview />
        </>
    );
}
