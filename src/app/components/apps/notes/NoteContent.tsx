'use client';
import type React from 'react';
import { useEffect, useState } from 'react';
import { TbCheck } from 'react-icons/tb';
import type { NotesType } from '@/app/(DashboardLayout)/types/apps/notes';
import { Textarea } from '@/components/ui/textarea';

interface ColorType {
    lineColor: string;
    disp: string;
    id: number;
}

interface NoteContentProps {
    note: NotesType | null;
    updateNote: (id: number, title: string, color: string) => void;
}

const NoteContent: React.FC<NoteContentProps> = ({ note, updateNote }) => {
    const [title, setTitle] = useState('');
    const [_isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (note?.title) setTitle(note.title);
    }, [note]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setTitle(e.target.value);
        setIsEditing(true);
    };

    const handleColorChange = (color: string) => {
        if (!note) return;
        updateNote(note.id, title, color);
    };

    const handleBlur = () => {
        if (!note) return;
        setIsEditing(false);
        updateNote(note.id, title, note.color || 'primary');
    };

    const colorOptions: ColorType[] = [
        { id: 1, lineColor: 'warning', disp: 'warning' },
        { id: 2, lineColor: 'primary', disp: 'primary' },
        { id: 3, lineColor: 'error', disp: 'error' },
        { id: 4, lineColor: 'success', disp: 'success' },
        { id: 5, lineColor: 'secondary', disp: 'secondary' },
    ];

    if (!note) {
        return (
            <div className="text-center w-full py-6 text-2xl text-muted-foreground">
                Select a Note
            </div>
        );
    }

    return (
        <div className="flex grow p-6">
            <div className="w-full">
                <Textarea
                    placeholder="Edit Note"
                    rows={5}
                    value={title}
                    onChange={handleTitleChange}
                    onBlur={handleBlur}
                    className="w-full p-6 form-control-textarea"
                />
                <br />
                <h6 className="text-base mb-3">Change Note Color</h6>
                <div className="flex gap-2 items-center">
                    {colorOptions.map((color) => (
                        <div
                            key={color.id}
                            onClick={() => handleColorChange(color.disp)}
                            className={`h-7 w-7 flex justify-center items-center rounded-full cursor-pointer 
                ${note.color === color.disp ? 'border-2 border-black' : ''} 
                bg-${color.disp}`}
                        >
                            {note.color === color.disp && (
                                <TbCheck size={18} className="text-white" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default NoteContent;
