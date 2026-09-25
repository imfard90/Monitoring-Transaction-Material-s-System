import type { Metadata } from 'next';
import NotesApp from '@/app/components/apps/notes';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
export const metadata: Metadata = {
    title: 'Notes App',
};

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Notes',
    },
];
const Notes = () => {
    return (
        <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="shrink-0"><BreadcrumbComp title="Notes app" items={BCrumb} /></div>
            <NotesApp />
        </div>
    );
};

export default Notes;
