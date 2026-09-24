import type { Metadata } from 'next';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import InOutTagClient from './_components/InOutTagClient';

export const metadata: Metadata = {
    title: 'InOut Tag',
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
        title: 'InOut Tag',
    },
];

export default function InOutTagPage() {
    return (
        <>
            <BreadcrumbComp title="InOut Tag" items={BCrumb} />
            <InOutTagClient />
        </>
    );
}
