import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { getNteTagOptions } from '@/lib/nte-tag-options';

import { getNteAddresses, getNteItems } from './_actions/tag-commands';
import { getNteTags } from './_actions/tag-queries';
import NteTagClient from './_components/NteTagClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Transaksi NTE | MTMS',
    description: 'Kelola transaksi tag perangkat NTE',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NteTagPage({ searchParams }: { searchParams: SearchParams }) {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');

    const params = await searchParams;
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 50;
    const search = typeof params.search === 'string' ? params.search : '';
    const typeTransaksi = typeof params.typeTransaksi === 'string' ? params.typeTransaksi : 'all';
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;

    const [tagsResult, addressesResult, itemsResult] = await Promise.all([
        getNteTags({ page, pageSize, search, typeTransaksi, startDate, endDate }),
        getNteAddresses(),
        getNteItems(),
    ]);

    return (
        <div className="flex flex-col gap-4">
            <BreadcrumbComp
                title="Transaksi NTE"
                items={[
                    { to: '/', title: 'Beranda' },
                    { to: '#', title: 'Apps' },
                    { title: 'Transaksi NTE' },
                ]}
            />
            <NteTagClient
                initialTags={tagsResult.data?.tags ?? []}
                pagination={tagsResult.data}
                {...getNteTagOptions(addressesResult.data, itemsResult.data)}
                initialFilters={{
                    search,
                    typeTransaksi,
                    page: String(page),
                    pageSize: String(pageSize),
                }}
            />
        </div>
    );
}
