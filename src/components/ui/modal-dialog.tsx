'use client';

import type * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ModalDialogProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal is closed (e.g., clicking outside or pressing Escape) */
    onClose: () => void;
    /** Modal title */
    title?: React.ReactNode;
    /** Modal description (optional) */
    description?: React.ReactNode;
    /** Modal content */
    children: React.ReactNode;
    /** Optional max-width or custom class for the content container */
    className?: string;
    /** Disable clicking outside to close */
    preventOutsideClose?: boolean;
}

export function ModalDialog({
    isOpen,
    onClose,
    title,
    description,
    children,
    className,
    preventOutsideClose = false,
}: ModalDialogProps) {
    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent
                className={cn('sm:max-w-md max-h-[90vh] overflow-y-auto', className)}
                onInteractOutside={(event) => {
                    if (preventOutsideClose) event.preventDefault();
                }}
            >
                {(title || description) && (
                    <DialogHeader>
                        {title && <DialogTitle>{title}</DialogTitle>}
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                <div className="flex min-h-0 flex-1 flex-col py-2">{children}</div>
            </DialogContent>
        </Dialog>
    );
}
