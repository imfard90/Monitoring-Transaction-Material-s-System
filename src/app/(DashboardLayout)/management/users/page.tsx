import type { Metadata } from 'next';
import { AccessDeniedState } from '@/components/auth/AccessDeniedState';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getPageSessionUser } from '@/lib/auth-server';
import { canAccessManagement } from '@/lib/policies';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getScopeHierarchyConfig, getUsers } from './actions';
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
    const session = await getPageSessionUser();

    if (!canAccessManagement(session)) {
        return (
            <AccessDeniedState description="Hanya Pejabat berwenang atau SuperUser yang dapat mengakses Manajemen Pengguna." />
        );
    }

    const [users, hierarchy] = await Promise.all([getUsers(), getScopeHierarchyConfig()]);

    return (
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full">
            <StaggerItem className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Manajemen Pengguna" items={BCrumb} />
            </StaggerItem>

            <StaggerItem className="bg-card rounded-lg border shadow-sm mt-4 flex-1 flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                <UserTable data={users} hierarchy={hierarchy} />
            </StaggerItem>
        </StaggerContainer>
    );
}
