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
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0">
                <BreadcrumbComp title="Hasil Rekon" items={BCrumb} />
            </div>
            <HasilRekonClient initialData={data} />
        </div>
    );
}
