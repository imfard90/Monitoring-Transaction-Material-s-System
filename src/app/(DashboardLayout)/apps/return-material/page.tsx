import type { Metadata } from 'next';
import React from 'react';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import ReturnForm from './_components/ReturnForm';

export const metadata: Metadata = {
    title: 'Return Material',
    description: 'Form for returning unused material',
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
        title: 'Return Material',
    },
];

export default function ReturnMaterialPage() {
    return (
        <>
            <BreadcrumbComp title="Return Material" items={BCrumb} />
            <ReturnForm />
        </>
    );
}
