import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Footer } from '@/app/components/dashboard/Footer';
import { getSessionUser } from '@/lib/auth-server';
import { getOutLensaRefList } from './_actions/out-lensa-actions';
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

export default async function OutLensaRefPage() {
    const { isStaff } = await getSessionUser();

    const { success, data, error } = await getOutLensaRefList();

    return (
        <div className="flex flex-col flex-1 gap-6 md:h-full md:min-h-0 md:overflow-hidden">
            <div className="shrink-0">
                <BreadcrumbComp title="Out Lensa Ref" items={BCrumb} />
            </div>

            <OutLensaRefClient
                initialData={success && data ? data : []}
                error={error}
                isStaff={isStaff}
            />
        </div>
    );
}
