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
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0"><BreadcrumbComp title="Tickets App" items={BCrumb} /></div>
            <TicketsApp />
        </div>
    );
};

export default Tickets;
