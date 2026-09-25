export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getHasilRekon } from './_actions/rekon-actions';
import HasilRekonClient from './_components/HasilRekonClient';

export const metadata: Metadata = {
    title: 'Hasil Rekon',
    description: 'Monitor reconciliation results',
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
        title: 'Hasil Rekon',
    },
];

export default async function HasilRekonPage() {
    const data = await getHasilRekon();

    return (
        <>
            <BreadcrumbComp title="Hasil Rekon" items={BCrumb} />
            <HasilRekonClient initialData={data} />
        </>
    );
}
