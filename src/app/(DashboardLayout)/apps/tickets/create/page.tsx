import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import CreateTicketForm from '@/app/components/apps/tickets/CreateTicketForm';

export const metadata: Metadata = {
    title: 'Ticket App',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Tickets',
    },
];
const CreateTickets = () => {
    return (
        <>
            <BreadcrumbComp title="Tickets App" items={BCrumb} />
            <CreateTicketForm />
        </>
    );
};

export default CreateTickets;
