import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Footer } from '@/app/components/dashboard/Footer';
import { AccessDeniedState } from '@/components/auth/AccessDeniedState';
import { getPageSessionUser } from '@/lib/auth-server';
import { hasPermission } from '@/lib/policies';
import OutSapForm from './_components/OutSapForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Out SAP | MTMS',
    description: 'Pencatatan transaksi pengeluaran SAP',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Form',
    },
    {
        title: 'Out SAP',
    },
];

export default async function OutSapPage() {
    const session = await getPageSessionUser();
    if (!hasPermission(session, 'out_sap:create')) {
        return (
            <AccessDeniedState description="Hanya Staff Gudang berwenang atau SuperUser yang dapat mengakses form Out SAP." />
        );
    }

    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full gap-6">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Out SAP" items={BCrumb} />
            </div>
            <OutSapForm />
            <Footer />
        </div>
    );
}
