export const dynamic = 'force-dynamic';

import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { canCreateInOutTag } from '@/lib/policies';
import { getInOutTagFilterOptions, getInOutTagsPaginated } from './_actions/tag-actions';
import InOutTagClient from './_components/InOutTagClient';

export const metadata = {
    title: 'InOut Tag | MTMS',
    description: 'Monitoring transaksi InOut Tag',
};

const BCrumb = [{ to: '/', title: 'Home' }, { to: '/apps', title: 'Apps' }, { title: 'InOut Tag' }];

interface SearchParams {
    page?: string;
    pageSize?: string;
    status?: string;
    warehouse?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
}

export default async function InOutTagPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sessionUser = await getSessionUser();
    const canCreateTag = canCreateInOutTag(sessionUser);

    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(params.pageSize ?? '20', 10)));
    const status = params.status ?? 'all';
    const warehouse = params.warehouse ?? 'all';
    const search = params.search ?? '';
    const startDate = params.startDate;
    const endDate = params.endDate;

    const [result, filterOptions] = await Promise.all([
        getInOutTagsPaginated({
            page,
            pageSize,
            status,
            warehouse,
            search,
            startDate,
            endDate,
        }),
        getInOutTagFilterOptions(),
    ]);

    return (
        <div className="flex flex-col flex-1 ">
            <div className="shrink-0">
                <BreadcrumbComp title="InOut Tag" items={BCrumb} />
            </div>

            <InOutTagClient
                canCreateTag={canCreateTag}
                isStaff={sessionUser.isStaff}
                warehouseIds={sessionUser.warehouseIds}
                initialData={result.success ? result.data.tags : []}
                counts={
                    result.success
                        ? result.data.counts
                        : { requested: 0, in_transit: 0, closed: 0, cancel: 0 }
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
                toWhOptions={filterOptions.toWhOptions}
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
