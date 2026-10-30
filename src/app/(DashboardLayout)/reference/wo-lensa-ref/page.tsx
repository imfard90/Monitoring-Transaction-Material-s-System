import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getPageSessionUser } from '@/lib/auth-server';
import { getWOLensaList } from './_actions/wo-lensa-actions';
import WOLensaRefClient from './_components/WOLensaRefClient';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Referensi WO Lensa | MTMS',
    description: 'Data referensi Work Order Lensa',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        to: '/reference',
        title: 'Reference',
    },
    {
        title: 'WO Lensa Ref',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    warehouse?: string;
    search?: string;
}

export default async function WOLensaRefPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const { isStaff } = await getPageSessionUser();

    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const warehouse = params.warehouse ?? 'all';
    const search = params.search ?? '';

    const result = await getWOLensaList({ page, pageSize, warehouseFilter: warehouse, search });

    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full gap-4 sm:gap-6">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="WO Lensa Ref" items={BCrumb} />
            </div>

            <WOLensaRefClient
                initialData={result.success ? (result.data?.headers ?? []) : []}
                pagination={
                    result.success
                        ? {
                              total: result.data?.total ?? 0,
                              page: result.data?.page ?? 1,
                              pageSize: result.data?.pageSize ?? 20,
                              totalPages: result.data?.totalPages ?? 0,
                          }
                        : undefined
                }
                error={result.success ? undefined : result.error}
                isStaff={isStaff}
                currentWarehouse={warehouse}
                currentSearch={search}
                warehouseOptions={result.success ? (result.data?.warehouses ?? []) : []}
                lastUpdate={result.success ? (result.data?.lastUpdate ?? null) : null}
            />
        </div>
    );
}
