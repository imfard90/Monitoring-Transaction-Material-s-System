'use client';

import { Icon } from '@iconify/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NotesType } from '@/app/(DashboardLayout)/types/apps/notes';
import NoteContent from '@/app/components/apps/notes/NoteContent';
import NotesSidebar from '@/app/components/apps/notes/NotesSidebar';
import CardBox from '@/app/components/shared/CardBox';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AddNotes from './AddNotes';

interface ColorType {
    id: number;
    disp: string;
    lineColor?: string;
}

const NotesApp = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notes, setNotes] = useState<NotesType[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
    const location = usePathname();

    const handleClose = () => setIsOpen(false);

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/notes');
            const data = await response.json();
            setNotes(data?.data || []);
        } catch (err) {
            console.error('Failed to fetch notes:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleResetNotes = async () => {
        await fetch('/api/notes', {
            method: 'GET',
            headers: { browserRefreshed: 'true' },
        });
        fetchNotes();
    };

    const colorVariation: ColorType[] = [
        { id: 1, lineColor: 'warning', disp: 'warning' },
        { id: 2, lineColor: 'primary', disp: 'primary' },
        { id: 3, lineColor: 'error', disp: 'error' },
        { id: 4, lineColor: 'success', disp: 'success' },
        { id: 5, lineColor: 'secondary', disp: 'secondary' },
    ];

    useEffect(() => {
        const isPageRefreshed = sessionStorage.getItem('isPageRefreshed');
        if (isPageRefreshed === 'true') {
            sessionStorage.removeItem('isPageRefreshed');
            handleResetNotes();
        } else {
            fetchNotes();
        }
    }, [location]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            sessionStorage.setItem('isPageRefreshed', 'true');
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const updateNote = (id: number, title: string, color: string) => {
        setNotes((prev) => prev.map((note) => (note.id === id ? { ...note, title, color } : note)));

        fetch(`/api/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, color }),
        }).catch((err) => console.error('Failed to update note:', err));
    };

    useEffect(() => {
        if (notes.length > 0 && selectedNoteId === null) {
            setSelectedNoteId(notes[0].id);
        }
    }, [notes, selectedNoteId]);

    const addNote = async (note: { title: string; color: string }) => {
        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(note),
            });
            const result = await response.json();
            const newNote: NotesType = result.data;
            setNotes((prev) => [...prev, newNote]);
            setSelectedNoteId(newNote.id);
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    };

    return (
        <CardBox className="p-0 overflow-hidden">
            <div className="flex">
                {/* Sidebar */}
                <div>
                    <Sheet open={isOpen} onOpenChange={handleClose}>
                        <SheetContent
                            side="left"
                            className="max-w-[320px] sm:max-w-[320px] w-full h-full lg:hidden block"
                        >
                            <NotesSidebar
                                notes={notes}
                                loading={loading}
                                onSelectNote={(id: number) => setSelectedNoteId(id)}
                                onDeleteNote={(id: number) => {
                                    setNotes((prev) => prev.filter((n) => n.id !== id));
                                    if (selectedNoteId === id) setSelectedNoteId(null);
                                }}
                            />
                        </SheetContent>
                    </Sheet>
                    <div className="max-w-[320px] h-auto lg:block hidden">
                        <NotesSidebar
                            notes={notes}
                            loading={loading}
                            onSelectNote={(id: number) => setSelectedNoteId(id)}
                            onDeleteNote={(id: number) => {
                                setNotes((prev) => prev.filter((n) => n.id !== id));
                                if (selectedNoteId === id) setSelectedNoteId(null);
                            }}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="w-full">
                    <div className="flex justify-between items-center border-b border-ld py-4 px-6">
                        <div className="flex gap-3 items-center">
                            <Button
                                color={'lightprimary'}
                                onClick={() => setIsOpen(true)}
                                className="btn-circle p-0 lg:!hidden flex"
                            >
                                <Icon icon="tabler:menu-2" height={18} />
                            </Button>
                            <h6 className="text-base">Edit Note</h6>
                        </div>
                        <AddNotes colors={colorVariation} addNote={addNote} />
                    </div>

                    <NoteContent
                        note={notes.find((n) => n.id === selectedNoteId) || null}
                        updateNote={updateNote}
                    />
                </div>
            </div>
        </CardBox>
    );
};

export default NotesApp;
