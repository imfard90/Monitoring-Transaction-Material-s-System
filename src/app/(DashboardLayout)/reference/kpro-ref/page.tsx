import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getPageSessionUser } from '@/lib/auth-server';
import { getKproRefList } from './_actions/kpro-ref-actions';
import KproRefClient from './_components/KproRefClient';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'K-Pro Ref | MTMS',
    description: 'Data referensi K-Pro Fulfillment Endstate',
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
        title: 'K-Pro Ref',
    },
];

interface SearchParams {
    page?: string;
    pageSize?: string;
    datel?: string;
    search?: string;
}

export default async function KproRefPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    // 1. Otorisasi page level
    await getPageSessionUser();

    // 2. Baca parameter URL
    const params = await searchParams;
    const page = Math.max(1, Number.parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(params.pageSize ?? '20', 10)));
    const datel = params.datel ?? 'all';
    const search = params.search ?? '';

    // 3. Ambil data list referensi K-Pro
    const result = await getKproRefList({
        page,
        pageSize,
        datelFilter: datel,
        search,
    });

    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full gap-4 sm:gap-6">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="K-Pro Ref" items={BCrumb} />
            </div>

            <KproRefClient
                initialData={result.success ? (result.data?.items ?? []) : []}
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
                currentDatel={datel}
                currentSearch={search}
                datelOptions={result.success ? (result.data?.datelOptions ?? []) : []}
                lastUpdate={result.success ? (result.data?.lastUpdate ?? null) : null}
            />
        </div>
    );
}
