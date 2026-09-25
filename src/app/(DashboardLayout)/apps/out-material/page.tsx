import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import OutMaterialClient from './_components/OutMaterialClient';

export const metadata: Metadata = {
    title: 'Out Material',
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
        title: 'Out Material',
    },
];

export default function OutMaterialPage() {
    return (
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0">
                <BreadcrumbComp title="Out Material" items={BCrumb} />
            </div>
            <OutMaterialClient />
        </div>
    );
}
