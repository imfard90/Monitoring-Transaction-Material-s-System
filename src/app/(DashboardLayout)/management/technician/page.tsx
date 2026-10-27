import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { getSessionUser } from '@/lib/auth-server';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getBranches, getMitras, getTechnicians } from './actions';
import TechnicianTable from './technician-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Manajemen Teknisi',
    description: 'Manajemen data teknisi, branch, dan mitra',
};

const BCrumb = [
    {
        to: '/',
        title: 'Beranda',
    },
    {
        to: '#',
        title: 'Manajemen',
    },
    {
        title: 'Teknisi',
    },
];

export default async function TechnicianManagementPage() {
    const session = await getSessionUser();

    // Prevent Teknisi from accessing page
    if (session.role === 'Teknisi') {
        redirect('/');
    }

    const [technicians, branches, mitras] = await Promise.all([
        getTechnicians(),
        getBranches(),
        getMitras(),
    ]);

    return (
        <StaggerContainer className="flex flex-col flex-1 w-full min-w-0 max-w-full">
            <StaggerItem className="shrink-0 w-full min-w-0">
                <BreadcrumbComp title="Manajemen Teknisi" items={BCrumb} />
            </StaggerItem>

            <StaggerItem className="bg-card rounded-lg border shadow-sm mt-4 flex-1 flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                <TechnicianTable data={technicians} branches={branches} mitras={mitras} />
            </StaggerItem>
        </StaggerContainer>
    );
}
