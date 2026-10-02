import { redirect } from 'next/navigation';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Footer } from '@/app/components/dashboard/Footer';
import { getSessionUser } from '@/lib/auth-server';
import { getWOLensaRefList } from './_actions/wo-lensa-actions';
import WOLensaRefClient from './_components/WOLensaRefClient';

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

    let initialData: any[] = [];
    let errorMsg = '';

    try {
        const list = await getWOLensaRefList();
        initialData = list;
    } catch (e: any) {
        console.error('Failed to load WO Lensa Ref List', e);
        errorMsg = 'Gagal memuat data WO Lensa Ref.';
    }

    return (
        <div className="flex flex-col flex-1 h-full gap-6">
            <div className="shrink-0">
                <BreadcrumbComp title="WO Lensa Ref" items={BCrumb} />
            </div>

            <WOLensaRefClient initialData={initialData} error={errorMsg} isStaff={isStaff} />

            <Footer />
        </div>
    );
}
