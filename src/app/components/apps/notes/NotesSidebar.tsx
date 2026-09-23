'use client';
import type React from 'react';
import type { NotesType } from '@/app/(DashboardLayout)/types/apps/notes';
import Notelist from './Notelist';

interface NotesSidebarProps {
    notes: NotesType[];
    loading: boolean;
    onSelectNote: (noteId: number) => void;
    onDeleteNote: (noteId: number) => void;
}

const NotesSidebar: React.FC<NotesSidebarProps> = ({
    notes,
    loading,
    onSelectNote,
    onDeleteNote,
}) => {
    return (
        <>
            <div className="left-part">
                <Notelist
                    notes={notes}
                    loading={loading}
                    onSelectNote={onSelectNote}
                    onDeleteNote={onDeleteNote}
                />
            </div>
        </>
    );
};

export default NotesSidebar;
