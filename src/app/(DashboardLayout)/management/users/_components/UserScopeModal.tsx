'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { RoleKey } from '@/lib/policies/rbac';

export interface ScopeHierarchyData {
    roles: Array<{
        id: number;
        role_key: RoleKey;
        role_name: string;
        hierarchy_level: number;
        description: string | null;
    }>;
    branches: Array<{
        id: number;
        area: string | null;
        regional: string | null;
        branch: string | null;
        service_area: string | null;
    }>;
    warehouses: Array<{
        id: number;
        name: string;
        branch: string;
    }>;
}

export interface UserScopeMappingPayload {
    userNik: string;
    roleKey: RoleKey;
    area: string | null;
    regional: string | null;
    branch: string | null;
    serviceArea: string | null;
    warehouseIds: number[];
    validUntil: string | null;
}

export interface UserScopeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: {
        nik: string;
        name: string;
        email: string;
        currentRoleKey?: RoleKey | null;
        currentArea?: string | null;
        currentRegional?: string | null;
        currentBranch?: string | null;
        currentServiceArea?: string | null;
        currentWarehouseIds?: number[];
        currentValidUntil?: string | null;
    } | null;
    hierarchy: ScopeHierarchyData;
    actorHierarchyLevel: number;
    isActorSuperUser: boolean;
    onSave: (payload: UserScopeMappingPayload) => Promise<{ success: boolean; error?: string }>;
}

export function UserScopeModal({
    open,
    onOpenChange,
    user,
    hierarchy,
    actorHierarchyLevel,
    isActorSuperUser,
    onSave,
}: UserScopeModalProps) {
    const [roleKey, setRoleKey] = useState<RoleKey>('STAFF_GUDANG');
    const [area, setArea] = useState<string>('');
    const [regional, setRegional] = useState<string>('');
    const [branch, setBranch] = useState<string>('');
    const [serviceArea, setServiceArea] = useState<string>('');
    const [warehouseIds, setWarehouseIds] = useState<number[]>([]);
    const [isPlt, setIsPlt] = useState(false);
    const [validUntil, setValidUntil] = useState('');
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !open) return;
        setRoleKey(user.currentRoleKey ?? 'STAFF_GUDANG');
        setArea(user.currentArea ?? '');
        setRegional(user.currentRegional ?? '');
        setBranch(user.currentBranch ?? '');
        setServiceArea(user.currentServiceArea ?? '');
        setWarehouseIds(user.currentWarehouseIds ?? []);
        setIsPlt(Boolean(user.currentValidUntil));
        setValidUntil(user.currentValidUntil ? user.currentValidUntil.slice(0, 10) : '');
        setErrorMsg(null);
    }, [user, open]);

    const assignableRoles = useMemo(
        () =>
            hierarchy.roles.filter(
                (r) => isActorSuperUser || actorHierarchyLevel <= r.hierarchy_level
            ),
        [hierarchy.roles, isActorSuperUser, actorHierarchyLevel]
    );

    const selectedRole = useMemo(
        () => hierarchy.roles.find((r) => r.role_key === roleKey),
        [hierarchy.roles, roleKey]
    );
    const level = selectedRole?.hierarchy_level ?? 5;

    const areaOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    hierarchy.branches.map((b) => b.area).filter((v): v is string => Boolean(v))
                )
            ),
        [hierarchy.branches]
    );

    const regionalOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    hierarchy.branches
                        .filter((b) => !area || b.area === area)
                        .map((b) => b.regional)
                        .filter((v): v is string => Boolean(v))
                )
            ),
        [hierarchy.branches, area]
    );

    const branchOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    hierarchy.branches
                        .filter(
                            (b) =>
                                (!area || b.area === area) && (!regional || b.regional === regional)
                        )
                        .map((b) => b.branch)
                        .filter((v): v is string => Boolean(v))
                )
            ),
        [hierarchy.branches, area, regional]
    );

    const serviceAreaOptions = useMemo(
        () =>
            Array.from(
                new Set(
                    hierarchy.branches
                        .filter((b) => !branch || b.branch === branch)
                        .map((b) => b.service_area)
                        .filter((v): v is string => Boolean(v))
                )
            ),
        [hierarchy.branches, branch]
    );

    const toggleWarehouse = (whId: number) => {
        setWarehouseIds((prev) =>
            prev.includes(whId) ? prev.filter((id) => id !== whId) : [...prev, whId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
        setErrorMsg(null);

        try {
            const res = await onSave({
                userNik: user.nik,
                roleKey,
                area: area || null,
                regional: level >= 2 ? regional || null : null,
                branch: level >= 3 ? branch || null : null,
                serviceArea: level === 4 ? serviceArea || null : null,
                warehouseIds: level === 5 ? warehouseIds : [],
                validUntil: isPlt && validUntil ? `${validUntil}T23:59:59.999Z` : null,
            });
            if (!res.success) {
                setErrorMsg(res.error ?? 'Gagal menyimpan konfigurasi hak akses.');
                return;
            }
            onOpenChange(false);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Konfigurasi Role & Scope Wilayah</DialogTitle>
                    <DialogDescription>
                        Atur tingkatan jabatan dan batasan teritorial untuk{' '}
                        <span className="font-medium text-foreground">{user?.name}</span> (NIK:{' '}
                        {user?.nik}).
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="rbac-role-select">Tingkatan Role</Label>
                        <select
                            id="rbac-role-select"
                            value={roleKey}
                            onChange={(e) => setRoleKey(e.target.value as RoleKey)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {assignableRoles.map((r) => (
                                <option key={r.role_key} value={r.role_key}>
                                    Level {r.hierarchy_level} — {r.role_name}
                                </option>
                            ))}
                        </select>
                        {selectedRole?.description && (
                            <p className="text-xs text-muted-foreground">
                                {selectedRole.description}
                            </p>
                        )}
                    </div>

                    {level <= 4 && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="rbac-area-select">Area</Label>
                                <select
                                    id="rbac-area-select"
                                    value={area}
                                    onChange={(e) => {
                                        setArea(e.target.value);
                                        setRegional('');
                                        setBranch('');
                                        setServiceArea('');
                                    }}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="">Pilih Area...</option>
                                    {areaOptions.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {level >= 2 && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="rbac-regional-select">Regional</Label>
                                    <select
                                        id="rbac-regional-select"
                                        value={regional}
                                        onChange={(e) => {
                                            setRegional(e.target.value);
                                            setBranch('');
                                            setServiceArea('');
                                        }}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Pilih Regional...</option>
                                        {regionalOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {level >= 3 && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="rbac-branch-select">Branch / District</Label>
                                    <select
                                        id="rbac-branch-select"
                                        value={branch}
                                        onChange={(e) => {
                                            setBranch(e.target.value);
                                            setServiceArea('');
                                        }}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Pilih Branch...</option>
                                        {branchOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {level === 4 && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="rbac-sa-select">Service Area</Label>
                                    <select
                                        id="rbac-sa-select"
                                        value={serviceArea}
                                        onChange={(e) => setServiceArea(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Pilih Service Area...</option>
                                        {serviceAreaOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {level === 5 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Penugasan Gudang (PIC)</Label>
                                <Badge variant="secondary">{warehouseIds.length} dipilih</Badge>
                            </div>
                            <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                                {hierarchy.warehouses.map((wh) => {
                                    const checked = warehouseIds.includes(wh.id);
                                    const checkboxId = `rbac-wh-${wh.id}`;
                                    return (
                                        <div
                                            key={wh.id}
                                            className="flex items-center gap-2.5 text-sm"
                                        >
                                            <Checkbox
                                                id={checkboxId}
                                                checked={checked}
                                                onCheckedChange={() => toggleWarehouse(wh.id)}
                                            />
                                            <Label
                                                htmlFor={checkboxId}
                                                className="flex flex-1 cursor-pointer items-center justify-between font-normal"
                                            >
                                                <span>{wh.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {wh.branch}
                                                </span>
                                            </Label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                        <div className="space-y-0.5">
                            <Label htmlFor="rbac-plt-switch">Penugasan Sementara (PLT / Pjs)</Label>
                            <p className="text-xs text-muted-foreground">
                                Batasi masa berlaku mapping hingga tanggal tertentu.
                            </p>
                        </div>
                        <Switch id="rbac-plt-switch" checked={isPlt} onCheckedChange={setIsPlt} />
                    </div>

                    {isPlt && (
                        <div className="space-y-1.5">
                            <Label htmlFor="rbac-valid-until">Berlaku Hingga</Label>
                            <Input
                                id="rbac-valid-until"
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    {errorMsg && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                            {errorMsg}
                        </p>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Batal
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
