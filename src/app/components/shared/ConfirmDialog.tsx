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
    variant?: 'default' | 'destructive';
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
    variant = 'default',
}: ConfirmDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] bg-background text-foreground p-0 overflow-hidden border border-border rounded-xl">
                <DialogHeader className="p-6 bg-muted/50 border-b border-border">
                    <DialogTitle className="text-xl text-foreground">{title}</DialogTitle>
                    {description && (
                        <DialogDescription className="text-muted-foreground mt-2">
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>

                <DialogFooter className="p-6 bg-muted/30 border-t border-border">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        onClick={onConfirm}
                        disabled={loading}
                        className="gap-2"
                    >
                        {icon}
                        {loading ? 'Memproses...' : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
