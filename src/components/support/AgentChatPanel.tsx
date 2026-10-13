'use client';

import { Bot, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AgentChatPanelProps {
    onBack: () => void;
}

export function AgentChatPanel({ onBack }: AgentChatPanelProps) {
    return (
        <section aria-labelledby="agent-chat-title" className="space-y-5">
            <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Bot aria-hidden="true" className="size-5" />
                </span>
                <div>
                    <h3 id="agent-chat-title" className="font-semibold text-foreground">
                        Agent Chat
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Percakapan langsung dengan Agent MTMS akan segera tersedia.
                    </p>
                </div>
            </div>

            <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground"
            >
                <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                <span>Segera hadir</span>
            </div>

            <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
                Kembali ke kanal bantuan
            </Button>
        </section>
    );
}
