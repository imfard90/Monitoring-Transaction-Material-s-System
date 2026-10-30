import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getSessionUser } from '@/lib/auth-server';
import { canAccessManagement } from '@/lib/policies';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getUsers } from './actions';
import UserTable from './user-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Manajemen Pengguna',
    description: 'Manajemen hak akses dan persetujuan pengguna sistem MTMS',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Management',
    },
    {
        title: 'Users',
    },
];

export default async function UserManagementPage() {
    const session = await getSessionUser();

    if (!canAccessManagement(session)) {
        redirect('/');
    }

    const users = await getUsers();

    return (
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full">
            <StaggerItem className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Manajemen Pengguna" items={BCrumb} />
            </StaggerItem>

            <StaggerItem className="bg-card rounded-lg border shadow-sm mt-4 flex-1 flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                <UserTable data={users} />
            </StaggerItem>
        </StaggerContainer>
    );
}
