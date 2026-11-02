import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Footer } from '@/app/components/dashboard/Footer';
import { getPageSessionUser } from '@/lib/auth-server';
import RekonIntechForm from './_components/RekonIntechForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Rekon Intech | MTMS',
    description: 'Rekonsiliasi transaksi Intech',
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
        title: 'Rekon Intech',
    },
];

export default async function RekonIntechPage() {
    await getPageSessionUser();

    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full gap-6">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Rekon Intech" items={BCrumb} />
            </div>
            <RekonIntechForm />
            <Footer />
        </div>
    );
}
