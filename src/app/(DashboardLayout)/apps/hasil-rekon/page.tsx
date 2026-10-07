export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getHasilRekon, getNewHasilRekon } from './_actions/rekon-actions';
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
    const [legacyData, newData] = await Promise.all([getHasilRekon(), getNewHasilRekon()]);

    return (
        <div className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            <div className="shrink-0">
                <BreadcrumbComp title="Hasil Rekon" items={BCrumb} />
            </div>
            <HasilRekonClient initialLegacyData={legacyData} initialNewData={newData} />
        </div>
    );
}
