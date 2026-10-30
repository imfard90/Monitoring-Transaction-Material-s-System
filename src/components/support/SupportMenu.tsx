'use client';

import { ArrowUpRight, Bot, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { AgentChatPanel } from './AgentChatPanel';
import { supportChannels } from './support.config';

type MenuView = 'channels' | 'agent-chat';

export function SupportMenu() {
    const [view, setView] = useState<MenuView>('channels');

    return (
        <div className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl">
            <header className="border-b border-border bg-linear-to-br from-primary/10 via-background to-background px-5 pb-4 pt-5">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
                        <MessageCircle aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                        <h2 className="font-semibold tracking-tight">
                            {view === 'channels' ? 'Butuh bantuan?' : 'Agent Chat'}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {view === 'channels'
                                ? 'Pilih kanal yang paling nyaman untuk Anda.'
                                : 'Pusat bantuan MTMS'}
                        </p>
                    </div>
                </div>
            </header>

            <div className="p-3">
                {view === 'agent-chat' ? (
                    <AgentChatPanel onBack={() => setView('channels')} />
                ) : (
                    <nav className="space-y-1" aria-label="Kanal bantuan">
                        <a
                            href={supportChannels.whatsapp.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                                <MessageCircle aria-hidden="true" className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">WhatsApp</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    Hubungi tim support
                                </span>
                            </span>
                            <ArrowUpRight
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                            />
                        </a>

                        <a
                            href={supportChannels.telegram.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                                <ArrowUpRight aria-hidden="true" className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">Telegram</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    Pesan tim support
                                </span>
                            </span>
                            <ArrowUpRight
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                            />
                        </a>

                        <button
                            type="button"
                            onClick={() => setView('agent-chat')}
                            className="group flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Bot aria-hidden="true" className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">Agent Chat</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    Percakapan langsung dengan Agent
                                </span>
                            </span>
                            <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                Segera hadir
                            </span>
                        </button>
                    </nav>
                )}
            </div>
            <footer className="border-t border-border px-5 py-3 text-center text-[11px] text-muted-foreground">
                Support MTMS · Senang membantu Anda
            </footer>
        </div>
    );
}
