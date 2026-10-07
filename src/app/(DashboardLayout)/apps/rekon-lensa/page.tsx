import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Footer } from '@/app/components/dashboard/Footer';
import RekonLensaForm from './_components/RekonLensaForm';

export const metadata: Metadata = {
    title: 'Rekon Lensa | MTMS',
    description: 'Rekonsiliasi Lensa',
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
        title: 'Rekon Lensa',
    },
];

export default function RekonLensaPage() {
    return (
        <div className="flex flex-col flex-1  gap-6">
            <div className="shrink-0">
                <BreadcrumbComp title="Rekon Lensa" items={BCrumb} />
            </div>
            <RekonLensaForm />
            <Footer />
        </div>
    );
}
