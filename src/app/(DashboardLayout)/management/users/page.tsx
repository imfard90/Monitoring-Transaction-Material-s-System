import { redirect } from 'next/navigation';
import React from 'react';
import { getSessionUser } from '@/lib/auth-server';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getUsers } from './actions';
import UserTable from './user-table';

export const dynamic = 'force-dynamic';

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        to: '#',
        title: 'Management',
    },
    {
        title: 'Users',
    },
];

export default async function UserManagementPage() {
    const session = await getSessionUser();

    // Server-side check to prevent staff from accessing
    if (session.isStaff) {
        redirect('/');
    }

    const users = await getUsers();

    return (
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0">
                <BreadcrumbComp title="User Management" items={BCrumb} />
            </div>

            <div className="bg-card rounded-lg border shadow-sm mt-4 flex-1 flex flex-col min-h-0">
                <UserTable data={users} />
            </div>
        </div>
    );
}
