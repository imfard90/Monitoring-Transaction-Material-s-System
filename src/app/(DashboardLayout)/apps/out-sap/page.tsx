import type { Metadata } from 'next';
import React from 'react';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import OutSapForm from './_components/OutSapForm';

export const metadata: Metadata = {
    title: 'Out SAP',
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
        title: 'Out SAP',
    },
];

export default function OutSapPage() {
    return (
        <>
            <BreadcrumbComp title="Out SAP" items={BCrumb} />
            <OutSapForm />
        </>
    );
}
