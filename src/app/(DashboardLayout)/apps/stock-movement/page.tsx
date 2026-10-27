export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import {
    getStockMovementFilterOptions,
    getStockMovementsPaginated,
} from './_actions/movement-actions';
import StockMovementClient from './_components/StockMovementClient';

export const metadata: Metadata = {
    title: 'Pergerakan Stok | MTMS',
    description: 'Riwayat pergerakan stok inventaris',
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
        title: 'Stock Movement',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    search?: string;
    warehouse?: string;
    material?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
}

export default async function StockMovementPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const search = params.search ?? '';
    const warehouse = params.warehouse ?? 'all';
    const material = params.material ?? 'all';
    const types = params.type ? params.type.split(',').filter(Boolean) : undefined;
    const startDate = params.startDate;
    const endDate = params.endDate;

    const [result, filterOptions] = await Promise.all([
        getStockMovementsPaginated({
            page,
            pageSize,
            search,
            warehouse,
            material,
            types,
            startDate,
            endDate,
        }),
        getStockMovementFilterOptions(),
    ]);

    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full md:h-full md:min-h-0">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Stock Movement" items={BCrumb} />
            </div>
            <StockMovementClient
                initialData={result.success ? result.data.movements : []}
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
                    material,
                    types: types ?? [],
                    startDate,
                    endDate,
                }}
            />
        </div>
    );
}
