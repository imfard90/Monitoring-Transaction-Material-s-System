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
        <>
            <BreadcrumbComp title="Notes app" items={BCrumb} />
            <NotesApp />
        </>
    );
};

export default Notes;
