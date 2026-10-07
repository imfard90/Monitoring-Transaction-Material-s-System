import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Footer } from '@/app/components/dashboard/Footer';
import { getSessionUser } from '@/lib/auth-server';
import { getWOLensaRefList } from './_actions/wo-lensa-actions';
import WOLensaRefClient, { type WOLensaHeader } from './_components/WOLensaRefClient';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: "WO Lensa Ref - Monitoring Transaction Material's System",
    description: 'Data WO Lensa Ref',
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

export default async function WOLensaRefPage() {
    const { isStaff } = await getSessionUser();

    let initialData: WOLensaHeader[] = [];
    let errorMsg = '';

    try {
        const list = await getWOLensaRefList();
        initialData = list as WOLensaHeader[];
    } catch (e: unknown) {
        console.error('Failed to load WO Lensa Ref List', e);
        errorMsg = 'Gagal memuat data WO Lensa Ref.';
    }

    return (
        <div className="flex flex-col flex-1 gap-6 md:h-full md:min-h-0 md:overflow-hidden">
            <div className="shrink-0">
                <BreadcrumbComp title="WO Lensa Ref" items={BCrumb} />
            </div>

            <WOLensaRefClient initialData={initialData} error={errorMsg} isStaff={isStaff} />
        </div>
    );
}
