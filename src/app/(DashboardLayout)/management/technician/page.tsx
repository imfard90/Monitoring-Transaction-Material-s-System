import React from 'react';
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
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0">
                <BreadcrumbComp title="Technician Management" items={BCrumb} />
            </div>

            <div className="bg-card rounded-lg border shadow-sm mt-4 overflow-hidden">
                <TechnicianTable data={technicians} branches={branches} mitras={mitras} />
            </div>
        </div>
    );
}
