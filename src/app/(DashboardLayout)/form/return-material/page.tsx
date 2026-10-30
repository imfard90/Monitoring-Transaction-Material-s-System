import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import ReturnForm from './_components/ReturnForm';

export const metadata: Metadata = {
    title: 'Pengembalian Material | MTMS',
    description: 'Formulir pengembalian sisa material',
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
        title: 'Return Material',
    },
];

import { Footer } from '@/app/components/dashboard/Footer';

export default function ReturnMaterialPage() {
    return (
        <div className="flex flex-col flex-1 w-full min-w-0 max-w-full gap-6">
            <div className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Return Material" items={BCrumb} />
            </div>
            <ReturnForm />
            <Footer />
        </div>
    );
}
