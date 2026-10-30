'use client';

import { format } from 'date-fns';
import { Clock } from 'lucide-react';

export interface ScraperLastUpdateInfo {
    timestamp: string;
    action: 'system' | 'manual';
    resume_result: string;
}

export interface LensaScraperStatusBannerProps {
    lastUpdate: ScraperLastUpdateInfo | null;
}

export function LensaScraperStatusBanner({ lastUpdate }: LensaScraperStatusBannerProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 flex-wrap">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                {lastUpdate ? (
                    <>
                        <span>
                            Update Terakhir:{' '}
                            <strong className="font-semibold text-foreground">
                                {(() => {
                                    try {
                                        return `${format(new Date(lastUpdate.timestamp), 'dd MMM yyyy, HH:mm')} WIB`;
                                    } catch {
                                        return lastUpdate.timestamp;
                                    }
                                })()}
                            </strong>
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                lastUpdate.action === 'system'
                                    ? 'bg-muted/60 text-foreground border-border'
                                    : 'bg-primary/10 text-primary border-primary/20'
                            }`}
                        >
                            {lastUpdate.action === 'system' ? 'System (Cron)' : 'Manual'}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="text-foreground/80 line-clamp-1">
                            {lastUpdate.resume_result}
                        </span>
                    </>
                ) : (
                    <span>Belum ada riwayat update scraper.</span>
                )}
            </div>
        </div>
    );
}
