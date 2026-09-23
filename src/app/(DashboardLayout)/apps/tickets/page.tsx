import type { Metadata } from 'next';
import TicketsApp from '@/app/components/apps/tickets';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
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
const Tickets = () => {
    return (
        <>
            <BreadcrumbComp title="Tickets App" items={BCrumb} />
            <TicketsApp />
        </>
    );
};

export default Tickets;
