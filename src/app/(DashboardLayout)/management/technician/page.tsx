import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getBranches, getMitras, getTechnicians } from './actions';
import TechnicianTable from './technician-table';

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
        title: 'Technicians',
    },
];

export default async function TechnicianManagementPage() {
    const [technicians, branches, mitras] = await Promise.all([
        getTechnicians(),
        getBranches(),
        getMitras(),
    ]);

    return (
        <StaggerContainer className="flex flex-col flex-1 h-full min-h-0">
            <StaggerItem className="shrink-0">
                <BreadcrumbComp title="Technician Management" items={BCrumb} />
            </StaggerItem>

            <StaggerItem className="bg-card rounded-lg border shadow-sm mt-4 overflow-hidden flex-1 flex flex-col">
                <TechnicianTable data={technicians} branches={branches} mitras={mitras} />
            </StaggerItem>
        </StaggerContainer>
    );
}
