import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
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
        to: '/apps',
        title: 'Apps',
    },
    {
        title: 'WO Lensa Ref',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    warehouse?: string;
}

export default async function WOLensaRefPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const { isStaff } = await getSessionUser();

    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const warehouse = params.warehouse ?? 'all';

    const result = await getWOLensaList({ page, pageSize, warehouseFilter: warehouse });

    return (
        <div className="flex flex-col flex-1 gap-6 md:h-full md:min-h-0 md:overflow-hidden">
            <div className="shrink-0">
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
                warehouseOptions={result.success ? (result.data?.warehouses ?? []) : []}
            />
        </div>
    );
}
