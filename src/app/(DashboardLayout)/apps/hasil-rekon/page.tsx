export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getHasilRekonFilterOptions, getHasilRekonPaginated } from './_actions/rekon-actions';
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

interface SearchParams {
    page?: string;
    pageSize?: string;
    search?: string;
    warehouse?: string;
    type?: string;
    material?: string;
    startDate?: string;
    endDate?: string;
}

export default async function HasilRekonPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const search = params.search ?? '';
    const warehouse = params.warehouse ?? 'all';
    const type = params.type ?? 'all';
    const material = params.material ?? 'all';
    const startDate = params.startDate;
    const endDate = params.endDate;

    const [result, filterOptions] = await Promise.all([
        getHasilRekonPaginated({
            page,
            pageSize,
            search,
            warehouse,
            type,
            material,
            startDate,
            endDate,
        }),
        getHasilRekonFilterOptions(),
    ]);

    return (
        <div className="flex flex-col flex-1 md:h-full md:min-h-0 md:overflow-hidden">
            <div className="shrink-0">
                <BreadcrumbComp title="Hasil Rekon" items={BCrumb} />
            </div>
            <HasilRekonClient
                initialData={result.success ? result.data.items : []}
                pagination={
                    result.success
                        ? {
                              total: result.data.total,
                              page: result.data.page,
                              pageSize: result.data.pageSize,
                              totalPages: result.data.totalPages,
                          }
                        : undefined
                }
                filterOptions={filterOptions}
                initialFilters={{
                    search,
                    warehouse,
                    type,
                    material,
                    startDate,
                    endDate,
                }}
            />
        </div>
    );
}
