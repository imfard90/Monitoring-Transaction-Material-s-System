import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import ReturnForm from './_components/ReturnForm';

export const metadata: Metadata = {
    title: 'Return Material',
    description: 'Form for returning unused material',
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
        title: 'Return Material',
    },
];

import { Footer } from '@/app/components/dashboard/Footer';

export default function ReturnMaterialPage() {
    return (
        <div className="flex flex-col gap-6">
            <BreadcrumbComp title="Return Material" items={BCrumb} />
            <ReturnForm />
            <Footer />
        </div>
    );
}
