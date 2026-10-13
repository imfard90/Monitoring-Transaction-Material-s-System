'use client';

import * as Popover from '@radix-ui/react-popover';
import { Headset, X } from 'lucide-react';
import { SupportMenu } from './SupportMenu';

export function FloatingSupportWidget() {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    aria-label="Buka kanal bantuan"
                    className="fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/25 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none sm:bottom-7 sm:right-7"
                >
                    <Headset aria-hidden="true" className="size-6" />
                    <span className="sr-only">Dukungan MTMS</span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="end"
                    sideOffset={14}
                    collisionPadding={16}
                    aria-label="Menu dukungan MTMS"
                    className="z-50 origin-bottom-right outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 motion-reduce:animate-none"
                >
                    <div className="relative">
                        <SupportMenu />
                        <Popover.Close
                            aria-label="Tutup menu bantuan"
                            className="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X aria-hidden="true" className="size-4" />
                        </Popover.Close>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
