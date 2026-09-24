import { Send } from 'lucide-react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    onConfirm: () => void;
    loading?: boolean;
    children?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    icon?: React.ReactNode;
}

export function ConfirmDialog({
    isOpen,
    onOpenChange,
    title,
    description,
    onConfirm,
    loading = false,
    children,
    confirmText = 'Submit Sekarang',
    cancelText = 'Kembali & Edit',
    icon = <Send size={16} />,
}: ConfirmDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] bg-white text-black p-0 overflow-hidden">
                <DialogHeader className="p-6 bg-slate-50 border-b">
                    <DialogTitle className="text-xl text-slate-800">{title}</DialogTitle>
                    {description && (
                        <DialogDescription className="text-slate-500 mt-2">
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>

                <DialogFooter className="p-6 bg-slate-50 border-t">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        {cancelText}
                    </Button>
                    <Button onClick={onConfirm} disabled={loading} className="gap-2">
                        {icon}
                        {loading ? 'Submitting...' : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
