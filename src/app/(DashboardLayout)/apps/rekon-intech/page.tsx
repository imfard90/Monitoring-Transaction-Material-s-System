import type { Metadata } from 'next';
import React from 'react';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import RekonIntechForm from './_components/RekonIntechForm';

export const metadata: Metadata = {
    title: 'Rekon Intech',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        to: '#', // or a valid pages root if any
        title: 'Pages',
    },
    {
        title: 'Rekon Intech',
    },
];

export default function RekonIntechPage() {
    return (
        <>
            <BreadcrumbComp title="Rekon Intech" items={BCrumb} />
            <RekonIntechForm />
        </>
    );
}
