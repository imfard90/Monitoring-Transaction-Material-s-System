import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getPageSessionUser } from '@/lib/auth-server';
import { getOutLensaRefList } from './_actions/out-lensa-queries';
import OutLensaRefClient from './_components/OutLensaRefClient';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Referensi Out Lensa | MTMS',
    description: 'Data referensi Out Lensa',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Reference',
    },
    {
        title: 'Out Lensa Ref',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    warehouse?: string;
    search?: string;
}

export default async function OutLensaRefPage({
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

    const result = await getOutLensaRefList({ page, pageSize, warehouseFilter: warehouse, search });

    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full gap-4 sm:gap-6">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Out Lensa Ref" items={BCrumb} />
            </div>

            <OutLensaRefClient
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
