import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getPageSessionUser } from '@/lib/auth-server';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import {
    getBranches,
    getMaterialsForSelect,
    getMitras,
    getTechnicians,
    getWarehouses,
} from './actions';
import TechnicianTable from './technician-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Manajemen Teknisi',
    description: 'Manajemen data teknisi, branch, dan mitra',
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
        title: 'Technicians',
    },
];

export default async function TechnicianManagementPage() {
    const session = await getPageSessionUser();

    // Prevent Teknisi from accessing page
    if (session.role === 'Teknisi') {
        redirect('/');
    }

    const [technicians, branches, mitras, warehouses, materials] = await Promise.all([
        getTechnicians(),
        getBranches(),
        getMitras(),
        getWarehouses(),
        session.isStaff ? Promise.resolve([]) : getMaterialsForSelect(),
    ]);

    return (
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full">
            <StaggerItem className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Manajemen Teknisi" items={BCrumb} />
            </StaggerItem>

            <StaggerItem className="bg-card rounded-lg border shadow-sm mt-4 flex-1 flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                <TechnicianTable
                    data={technicians}
                    branches={branches}
                    mitras={mitras}
                    warehouses={warehouses}
                    materials={materials}
                    isStaff={session.isStaff}
                />
            </StaggerItem>
        </StaggerContainer>
    );
}
