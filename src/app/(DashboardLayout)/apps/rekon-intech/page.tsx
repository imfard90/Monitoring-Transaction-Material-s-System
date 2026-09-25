import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import RekonIntechForm from './_components/RekonIntechForm';

export const metadata: Metadata = {
    title: 'Rekon Intech',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        to: '#', // or a valid pages root if any
        title: 'Pages',
    },
    {
        title: 'Rekon Intech',
    },
];

import { Footer } from '@/app/components/dashboard/Footer';

export default function RekonIntechPage() {
    return (
        <div className="flex flex-col flex-1 h-full gap-6">
            <BreadcrumbComp title="Rekon Intech" items={BCrumb} />
            <RekonIntechForm />
            <Footer />
        </div>
    );
}
