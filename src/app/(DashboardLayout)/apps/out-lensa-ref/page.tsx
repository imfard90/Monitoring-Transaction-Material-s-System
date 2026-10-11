import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { getOutLensaFilterOptions, getOutLensaRefList } from './_actions/out-lensa-queries';
import OutLensaRefClient from './_components/OutLensaRefClient';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: "Out Lensa Ref - Monitoring Transaction Material's System",
    description: 'Data Out Lensa Ref',
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
        title: 'Out Lensa Ref',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    warehouse?: string;
}

export default async function OutLensaRefPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const { isStaff } = await getSessionUser();

    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const warehouse = params.warehouse ?? 'all';

    const [result, filterOptions] = await Promise.all([
        getOutLensaRefList({ page, pageSize, warehouseFilter: warehouse }),
        getOutLensaFilterOptions(),
    ]);

    return (
        <div className="flex flex-col flex-1 gap-6 md:h-full md:min-h-0 md:overflow-hidden">
            <div className="shrink-0">
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
                warehouseOptions={filterOptions.warehouses}
            />
        </div>
    );
}
