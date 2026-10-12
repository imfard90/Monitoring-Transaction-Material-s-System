export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import {
    getOutMaterialFilterOptions,
    getOutMaterialsPaginated,
} from './_actions/out-material-actions';
import OutMaterialClient from './_components/OutMaterialClient';

export const metadata: Metadata = {
    title: 'Pengeluaran Material | MTMS',
    description: 'Monitoring transaksi pengeluaran material',
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
        title: 'Out Material',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    status?: string;
    warehouse?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
}

export default async function OutMaterialPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const status = params.status ?? 'all';
    const warehouse = params.warehouse ?? 'all';
    const search = params.search ?? '';
    const startDate = params.startDate;
    const endDate = params.endDate;

    const [result, filterOptions] = await Promise.all([
        getOutMaterialsPaginated({
            page,
            pageSize,
            status,
            warehouse,
            search,
            startDate,
            endDate,
        }),
        getOutMaterialFilterOptions(),
    ]);

    return (
        <div className="flex flex-col flex-1 ">
            <div className="shrink-0">
                <BreadcrumbComp title="Out Material" items={BCrumb} />
            </div>
            <OutMaterialClient
                initialData={result.success ? result.data.headers : []}
                counts={
                    result.success
                        ? result.data.counts
                        : { wait_approve: 0, request: 0, intech: 0, close: 0 }
                }
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
                whOptions={filterOptions.warehouses}
                initialFilters={{
                    status,
                    warehouse,
                    search,
                    startDate,
                    endDate,
                }}
            />
        </div>
    );
}
