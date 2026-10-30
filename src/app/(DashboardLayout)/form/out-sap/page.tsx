import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import OutSapForm from './_components/OutSapForm';

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

import { Footer } from '@/app/components/dashboard/Footer';

export default function OutSapPage() {
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
