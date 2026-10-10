import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth-server';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import InOutTagClient from './_components/InOutTagClient';

export const metadata: Metadata = {
    title: 'InOut Tag',
};
export const dynamic = 'force-dynamic';

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

export default async function InOutTagPage() {
    // Fetch user session to determine permissions
    const sessionUser = await getSessionUser();

    // Staff role cannot create tags (only view and update)
    const canCreateTag = sessionUser.role !== 'Staff';

    return (
        <div className="flex flex-col flex-1 ">
            <div className="shrink-0">
                <BreadcrumbComp title="InOut Tag" items={BCrumb} />
            </div>
            <InOutTagClient canCreateTag={canCreateTag} />
        </div>
    );
}
