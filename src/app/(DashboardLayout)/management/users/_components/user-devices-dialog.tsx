'use client';

import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Globe, Laptop, Loader2, ShieldOff, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { UserItem } from '../user-table';
import { getUserDevices, revokeDeviceByAdmin } from '../actions';

interface DeviceRecord {
    id?: string;
    user_id: string;
    device_name?: string | null;
    device_fingerprint: string;
    ip_address?: string | null;
    user_agent?: string | null;
    last_used_at?: Date | string;
    created_at?: Date | string;
    is_revoked?: boolean;
    revoked_at?: Date | string | null;
    revoked_by?: string | null;
}

interface UserDevicesDialogProps {
    user: UserItem | null;
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export function UserDevicesDialog({ user, isOpen, onClose, onRefresh }: UserDevicesDialogProps) {
    const [devices, setDevices] = useState<DeviceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isPending, startTransition] = useTransition();

    const fetchDevices = useCallback(async (userId: string) => {
        setIsLoading(true);
        try {
            const data = await getUserDevices(userId);
            setDevices(data as DeviceRecord[]);
        } catch (_error) {
            toast.error('Gagal memuat daftar perangkat.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && user?.id) {
            fetchDevices(user.id);
        } else {
            setDevices([]);
        }
    }, [isOpen, user?.id, fetchDevices]);

    const handleRevoke = (deviceId?: string) => {
        if (!user || !deviceId) return;
        startTransition(async () => {
            try {
                const res = await revokeDeviceByAdmin(user.id, deviceId);
                if (res.success) {
                    toast.success('Akses perangkat berhasil dicabut.');
                    fetchDevices(user.id);
                    onRefresh();
                } else {
                    toast.error('Gagal mencabut akses perangkat.');
                }
            } catch (_err) {
                toast.error('Terjadi kesalahan saat mencabut perangkat.');
            }
        });
    };

    const activeCount = devices.filter((d) => !d.is_revoked).length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg p-6 rounded-xl border-border/70 bg-background/95 backdrop-blur-md shadow-2xl">
                <DialogHeader className="space-y-1">
                    <div className="flex items-center justify-between pr-6">
                        <DialogTitle className="text-base font-semibold">
                            Perangkat Terdaftar: {user?.name}
                        </DialogTitle>
                        <Badge
                            variant="outline"
                            className={`text-xs ${
                                activeCount >= 3
                                    ? 'border-destructive text-destructive bg-destructive/10'
                                    : 'border-primary/40 text-primary bg-primary/5'
                            }`}
                        >
                            {activeCount} / 3 Aktif
                        </Badge>
                    </div>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Daftar perangkat yang diotorisasi untuk mengakses akun ini melalui verifikasi MFA.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    {isLoading ? (
                        <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-xs">Memuat perangkat...</span>
                        </div>
                    ) : devices.length === 0 ? (
                        <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2 text-center">
                            <Smartphone className="w-8 h-8 text-muted-foreground/40" />
                            <span className="text-xs">Belum ada perangkat yang terdaftar untuk akun ini.</span>
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                            {devices.map((device) => {
                                const isRevoked = !!device.is_revoked;
                                const isMobile =
                                    device.device_name?.includes('iOS') ||
                                    device.device_name?.includes('Android');

                                return (
                                    <div
                                        key={device.id || device.device_fingerprint}
                                        className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-colors ${
                                            isRevoked
                                                ? 'bg-muted/20 border-border/40 opacity-60'
                                                : 'bg-card border-border/70 shadow-xs hover:border-primary/30'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={`p-2 rounded-md shrink-0 mt-0.5 ${
                                                    isRevoked
                                                        ? 'bg-muted text-muted-foreground'
                                                        : 'bg-primary/10 text-primary'
                                                }`}
                                            >
                                                {isMobile ? (
                                                    <Smartphone className="w-4 h-4" />
                                                ) : (
                                                    <Laptop className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-1.5 font-medium text-foreground">
                                                    <span>{device.device_name || 'Browser'}</span>
                                                    {isRevoked ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] py-0 px-1 border-muted text-muted-foreground"
                                                        >
                                                            Dicabut
                                                        </Badge>
                                                    ) : (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] py-0 px-1 border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                                                        >
                                                            Aktif
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Globe className="w-3 h-3" />
                                                        {device.ip_address || '-'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>
                                                        Terakhir:{' '}
                                                        {device.last_used_at
                                                            ? format(
                                                                  new Date(device.last_used_at),
                                                                  'dd MMM yyyy, HH:mm',
                                                                  { locale: idLocale }
                                                              )
                                                            : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {!isRevoked && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRevoke(device.id)}
                                                disabled={isPending}
                                                className="h-8 px-2 text-destructive hover:bg-destructive/10 text-xs gap-1 shrink-0"
                                                title="Cabut izin perangkat ini"
                                            >
                                                <ShieldOff className="w-3.5 h-3.5" />
                                                Cabut
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                    <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
                        Tutup
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

