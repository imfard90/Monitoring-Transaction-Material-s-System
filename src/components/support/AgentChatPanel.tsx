'use client';

import { ArrowLeft, Bot, Loader2, RotateCcw, Send, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HermesChatMessage } from '@/lib/services/hermes/types';

interface AgentChatPanelProps {
    onBack: () => void;
}

const INITIAL_WELCOME_MESSAGE: HermesChatMessage = {
    id: 'mtms-welcome',
    role: 'assistant',
    content:
        'Halo! Saya **MTMS Agent**, asisten AI untuk Monitoring Transaction Material\'s System (MTMS).\nAda yang bisa saya bantu terkait operasional, transaksi material, atau panduan sistem ini?',
    createdAt: new Date().toISOString(),
};

function formatTime(isoString?: string): string {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

export function AgentChatPanel({ onBack }: AgentChatPanelProps) {
    const [messages, setMessages] = useState<HermesChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingHistory, setIsFetchingHistory] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    // 1. Ambil riwayat percakapan yang tersimpan di Redis saat komponen dimuat
    useEffect(() => {
        let isMounted = true;
        async function loadHistory() {
            try {
                const res = await fetch('/api/chat-agent', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) throw new Error('Gagal memuat riwayat obrolan');
                const data = await res.json();
                if (isMounted && data.success && Array.isArray(data.messages)) {
                    if (data.messages.length > 0) {
                        setMessages(data.messages);
                    } else {
                        setMessages([INITIAL_WELCOME_MESSAGE]);
                    }
                }
            } catch {
                if (isMounted) {
                    setMessages([INITIAL_WELCOME_MESSAGE]);
                }
            } finally {
                if (isMounted) {
                    setIsFetchingHistory(false);
                    setTimeout(() => scrollToBottom('auto'), 50);
                }
            }
        }

        loadHistory();
        return () => {
            isMounted = false;
        };
    }, [scrollToBottom]);

    useEffect(() => {
        if (!isFetchingHistory && (messages.length > 0 || isLoading)) {
            scrollToBottom();
        }
    }, [messages.length, isLoading, isFetchingHistory, scrollToBottom]);

    // 2. Kirim pesan ke Hermes
    async function handleSend() {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        setError(null);
        setInput('');

        const userMsg: HermesChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed,
            createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const res = await fetch('/api/chat-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal menerima balasan dari MTMS Agent.');
            }

            if (data.messages && Array.isArray(data.messages)) {
                setMessages(data.messages);
            } else if (data.message) {
                setMessages((prev) => [...prev, data.message]);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Terjadi gangguan jaringan';
            setError(msg);
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }

    // 3. Bersihkan sesi obrolan di Redis
    async function handleClearChat() {
        if (isLoading) return;
        try {
            await fetch('/api/chat-agent', { method: 'DELETE' });
            setMessages([
                {
                    ...INITIAL_WELCOME_MESSAGE,
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                },
            ]);
            setError(null);
        } catch {
            setError('Gagal membersihkan riwayat obrolan');
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    }

    return (
        <section
            aria-labelledby="agent-chat-title"
            className="flex flex-col h-full overflow-hidden bg-background"
        >
            {/* Header Chat Panel */}
            <header className="flex items-center justify-between border-b border-border pl-3.5 pr-11 py-2.5 bg-muted/40 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                        onClick={onBack}
                        aria-label="Kembali ke menu kanal"
                    >
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Bot className="size-4" />
                            <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                        </span>
                        <div className="min-w-0">
                            <h3
                                id="agent-chat-title"
                                className="text-xs font-semibold leading-tight text-foreground flex items-center gap-1.5 truncate"
                            >
                                MTMS Agent
                            </h3>
                            <p className="text-[10px] text-muted-foreground leading-none">
                                Aktif · Sesi 10 mnt
                            </p>
                        </div>
                    </div>
                </div>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                    onClick={() => void handleClearChat()}
                    title="Mulai percakapan baru / bersihkan riwayat"
                    aria-label="Mulai percakapan baru"
                >
                    <RotateCcw className="size-3.5" />
                </Button>
            </header>

            {/* Inactivity Session Notice */}
            <div className="bg-muted/30 border-b border-border/60 px-3 py-1 text-center">
                <p className="text-[10px] text-muted-foreground/80">
                    Sesi ditutup otomatis jika inaktif selama 10 menit.
                </p>
            </div>

            {/* Messages Scroll Area */}
            <div
                className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 text-xs"
                role="log"
                aria-live="polite"
            >
                {isFetchingHistory ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                        <Loader2 className="size-4 animate-spin text-primary" />
                        <span className="text-[11px]">Memuat riwayat percakapan...</span>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    'flex items-end gap-1.5',
                                    isUser ? 'justify-end' : 'justify-start'
                                )}
                            >
                                {!isUser && (
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary mb-0.5">
                                        <Bot className="size-3.5" />
                                    </span>
                                )}

                                <div
                                    className={cn(
                                        'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-xs',
                                        isUser
                                            ? 'bg-primary text-primary-foreground rounded-br-xs'
                                            : 'bg-muted/70 text-foreground border border-border/60 rounded-bl-xs'
                                    )}
                                >
                                    <div className="whitespace-pre-wrap wrap-break-words">
                                        {msg.content}
                                    </div>
                                    <div
                                        className={cn(
                                            'mt-1 text-[9px] text-right opacity-70',
                                            isUser
                                                ? 'text-primary-foreground/80'
                                                : 'text-muted-foreground'
                                        )}
                                    >
                                        {formatTime(msg.createdAt)}
                                    </div>
                                </div>

                                {isUser && (
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground mb-0.5">
                                        <User className="size-3.5" />
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Animated Typing Indicator */}
                {isLoading && (
                    <div className="flex items-end gap-1.5 justify-start">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary mb-0.5">
                            <Bot className="size-3.5" />
                        </span>
                        <div className="rounded-2xl rounded-bl-xs bg-muted/70 border border-border/60 px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                            <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                            <span className="size-1.5 rounded-full bg-primary animate-bounce" />
                            <span className="text-[10px] ml-1.5 font-medium text-foreground/80">
                                MTMS Agent sedang berpikir...
                            </span>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-start justify-between gap-2">
                        <span>{error}</span>
                        <button
                            type="button"
                            onClick={() => setError(null)}
                            className="font-semibold underline shrink-0 hover:opacity-80"
                        >
                            Tutup
                        </button>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <footer className="border-t border-border p-2.5 bg-background shrink-0">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleSend();
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-2.5 py-1.5 focus-within:border-primary/40 transition-colors duration-150"
                >
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ketik pesan untuk MTMS Agent... (Enter untuk kirim)"
                        disabled={isLoading}
                        className="flex-1 resize-none border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none focus:outline-none ring-0 focus:ring-0 shadow-none max-h-24 py-1 leading-normal"
                    />

                    <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || isLoading}
                        className="size-7 rounded-lg shrink-0"
                        aria-label="Kirim pesan"
                    >
                        {isLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Send className="size-3.5" />
                        )}
                    </Button>
                </form>
            </footer>
        </section>
    );
}
