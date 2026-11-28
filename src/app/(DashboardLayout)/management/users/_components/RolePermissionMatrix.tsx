'use client';

import { Check, Lock, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useAuthPermissions } from '@/components/auth/SessionPermissionProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SearchField } from '@/components/ui/search-field';
import type { PermissionRecord, RoleRecord } from '@/lib/repositories/rbac.repository';
import { saveRolePermissionsAction } from '../actions';

export interface RolePermissionMatrixData {
    roles: RoleRecord[];
    permissions: PermissionRecord[];
    rolePermissions: Record<number, string[]>;
}

const MODULE_LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    stock: 'Stok & Monitoring',
    out_sap: 'Out SAP',
    rekon: 'Rekonsiliasi',
    return: 'Return Material & NTE',
    stock_opname: 'Stock Opname',
    inout_tag: 'InOut Tag & Mutasi',
    po: 'Purchase Order (PO)',
    reference: 'Referensi & Scraper',
    users: 'Manajemen Pengguna',
    technicians: 'Manajemen Teknisi',
    policy: 'Kebijakan & Master Gudang',
};

function formatModuleLabel(mod: string): string {
    return (
        MODULE_LABELS[mod] ??
        mod
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
    );
}

export function RolePermissionMatrix({ initialData }: { initialData: RolePermissionMatrixData }) {
    const { can, isSuperUser, hierarchyLevel } = useAuthPermissions();
    const canManageUsers = can('users:manage');

    const [matrix, setMatrix] = useState<Record<number, string[]>>(initialData.rolePermissions);
    const [selectedRoleId, setSelectedRoleId] = useState<number>(initialData.roles[0]?.id ?? 0);
    const [draftKeys, setDraftKeys] = useState<string[]>(
        initialData.rolePermissions[initialData.roles[0]?.id ?? 0] ?? []
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [isPending, startTransition] = useTransition();

    const selectedRole = useMemo(
        () => initialData.roles.find((r) => r.id === selectedRoleId) ?? null,
        [initialData.roles, selectedRoleId]
    );

    const canEditSelectedRole =
        canManageUsers &&
        Boolean(selectedRole) &&
        (isSuperUser || hierarchyLevel <= (selectedRole?.hierarchy_level ?? 99));

    const savedKeys = matrix[selectedRoleId] ?? [];
    const hasUnsavedChanges = useMemo(() => {
        if (draftKeys.length !== savedKeys.length) return true;
        const savedSet = new Set(savedKeys);
        return draftKeys.some((k) => !savedSet.has(k));
    }, [draftKeys, savedKeys]);

    const handleSelectRole = (roleId: number) => {
        setSelectedRoleId(roleId);
        setDraftKeys(matrix[roleId] ?? []);
    };

    const togglePermission = (key: string) => {
        if (!canEditSelectedRole) return;
        setDraftKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const toggleModuleAll = (keysInModule: string[]) => {
        if (!canEditSelectedRole) return;
        const allSelected = keysInModule.every((k) => draftKeys.includes(k));
        if (allSelected) {
            setDraftKeys((prev) => prev.filter((k) => !keysInModule.includes(k)));
        } else {
            setDraftKeys((prev) => Array.from(new Set([...prev, ...keysInModule])));
        }
    };

    const groupedPermissions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const groups = new Map<string, PermissionRecord[]>();
        for (const perm of initialData.permissions) {
            if (
                q &&
                !perm.permission_key.toLowerCase().includes(q) &&
                !perm.module.toLowerCase().includes(q) &&
                !(perm.description ?? '').toLowerCase().includes(q)
            ) {
                continue;
            }
            const list = groups.get(perm.module) ?? [];
            list.push(perm);
            groups.set(perm.module, list);
        }
        return Array.from(groups.entries());
    }, [initialData.permissions, searchQuery]);

    const handleSave = () => {
        if (!selectedRole || !canEditSelectedRole) return;
        startTransition(async () => {
            const res = await saveRolePermissionsAction({
                roleId: selectedRole.id,
                permissionKeys: draftKeys,
            });
            if (res.success) {
                setMatrix((prev) => ({ ...prev, [selectedRole.id]: [...draftKeys] }));
                toast.success(
                    `Wewenang untuk "${selectedRole.role_name}" berhasil disimpan (${draftKeys.length} izin aktif).`
                );
            } else {
                toast.error(res.error ?? 'Gagal menyimpan matriks wewenang.');
            }
        });
    };

    return (
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-border">
            {/* Left Role Selector Rail */}
            <aside
                aria-label="Daftar tingkatan role"
                className="w-full lg:w-68 shrink-0 p-4 space-y-2 bg-muted/15 border-b lg:border-b-0 border-border"
            >
                <div className="px-1 pb-1">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Tingkatan Role ({initialData.roles.length})
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
                    {initialData.roles.map((role) => {
                        const isSelected = role.id === selectedRoleId;
                        const activeCount = (isSelected ? draftKeys : (matrix[role.id] ?? []))
                            .length;
                        return (
                            <button
                                key={role.id}
                                type="button"
                                onClick={() => handleSelectRole(role.id)}
                                className={`w-full text-left rounded-md border px-3 py-2 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                    isSelected
                                        ? 'border-primary/40 bg-primary/10 shadow-2xs'
                                        : 'border-border/70 bg-card hover:bg-muted/50'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-foreground truncate">
                                        {role.role_name}
                                    </span>
                                    <Badge
                                        variant={isSelected ? 'default' : 'outline'}
                                        className="text-[10px] py-0 px-1.5 tabular-nums shrink-0 h-4"
                                    >
                                        L{role.hierarchy_level}
                                    </Badge>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                    <span className="font-mono truncate">{role.role_key}</span>
                                    <span className="tabular-nums font-medium text-foreground/80 shrink-0">
                                        {activeCount}/{initialData.permissions.length}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </aside>

            {/* Right Permission Editor */}
            <section aria-label="Editor matriks wewenang" className="flex-1 min-w-0 p-4 space-y-4">
                {selectedRole ? (
                    <>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-3">
                            <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <ShieldCheck
                                        className="size-4 text-primary shrink-0"
                                        aria-hidden="true"
                                    />
                                    <h3 className="text-base font-semibold text-foreground">
                                        {selectedRole.role_name}
                                    </h3>
                                    <Badge variant="outline" className="font-mono text-[11px]">
                                        {selectedRole.role_key}
                                    </Badge>
                                    {hasUnsavedChanges && (
                                        <Badge
                                            variant="outline"
                                            className="text-[10.5px] border-warning/40 text-warning bg-warning/10"
                                        >
                                            Belum Disimpan
                                        </Badge>
                                    )}
                                </div>
                                {selectedRole.description && (
                                    <p className="text-xs text-muted-foreground">
                                        {selectedRole.description}
                                    </p>
                                )}
                                {!canEditSelectedRole && (
                                    <p className="inline-flex items-center gap-1.5 text-xs text-warning font-medium pt-0.5">
                                        <Lock className="size-3.5" aria-hidden="true" />
                                        <span>
                                            Mode baca saja: Anda tidak dapat mengubah wewenang role
                                            ini.
                                        </span>
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!hasUnsavedChanges || isPending}
                                    onClick={() => setDraftKeys(savedKeys)}
                                    className="h-8 gap-1.5 text-xs"
                                >
                                    <RotateCcw className="size-3.5" />
                                    <span>Reset</span>
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={
                                        !canEditSelectedRole || !hasUnsavedChanges || isPending
                                    }
                                    onClick={handleSave}
                                    className="h-8 gap-1.5 text-xs"
                                >
                                    <Save className="size-3.5" />
                                    <span>{isPending ? 'Menyimpan...' : 'Simpan Wewenang'}</span>
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <SearchField
                                wrapperClassName="w-full sm:w-72"
                                placeholder="Cari izin atau modul..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                onClear={() => setSearchQuery('')}
                                clearLabel="Hapus pencarian izin"
                            />
                            <span className="text-xs text-muted-foreground tabular-nums">
                                <span className="font-semibold text-foreground">
                                    {draftKeys.length}
                                </span>{' '}
                                dari{' '}
                                <span className="font-semibold text-foreground">
                                    {initialData.permissions.length}
                                </span>{' '}
                                izin aktif
                            </span>
                        </div>

                        {groupedPermissions.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                                Tidak ada izin yang cocok dengan pencarian &ldquo;{searchQuery}
                                &rdquo;.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {groupedPermissions.map(([moduleName, perms]) => {
                                    const keysInModule = perms.map((p) => p.permission_key);
                                    const activeInModule = keysInModule.filter((k) =>
                                        draftKeys.includes(k)
                                    ).length;
                                    const allSelected =
                                        keysInModule.length > 0 &&
                                        activeInModule === keysInModule.length;

                                    return (
                                        <div key={moduleName} className="space-y-2">
                                            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-xs font-semibold text-foreground truncate">
                                                        {formatModuleLabel(moduleName)}
                                                    </span>
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] py-0 px-1.5 tabular-nums h-4"
                                                    >
                                                        {activeInModule}/{keysInModule.length}
                                                    </Badge>
                                                </div>
                                                {canEditSelectedRole && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleModuleAll(keysInModule)
                                                        }
                                                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer shrink-0 inline-flex items-center gap-1"
                                                    >
                                                        {allSelected && (
                                                            <Check className="size-3" />
                                                        )}
                                                        <span>
                                                            {allSelected
                                                                ? 'Kosongkan'
                                                                : 'Pilih Semua'}
                                                        </span>
                                                    </button>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {perms.map((perm) => {
                                                    const checked = draftKeys.includes(
                                                        perm.permission_key
                                                    );
                                                    const inputId = `perm-${selectedRole.id}-${perm.id}`;
                                                    return (
                                                        <div
                                                            key={perm.id}
                                                            className={`flex items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
                                                                checked
                                                                    ? 'border-primary/30 bg-primary/5'
                                                                    : 'border-border/70 bg-background/60 hover:bg-muted/30'
                                                            }`}
                                                        >
                                                            <Checkbox
                                                                id={inputId}
                                                                checked={checked}
                                                                disabled={!canEditSelectedRole}
                                                                onCheckedChange={() =>
                                                                    togglePermission(
                                                                        perm.permission_key
                                                                    )
                                                                }
                                                                className="mt-0.5"
                                                            />
                                                            <Label
                                                                htmlFor={inputId}
                                                                className={`flex flex-col gap-0.5 min-w-0 flex-1 font-normal ${
                                                                    canEditSelectedRole
                                                                        ? 'cursor-pointer'
                                                                        : 'cursor-not-allowed opacity-80'
                                                                }`}
                                                            >
                                                                <span className="font-mono text-xs font-medium text-foreground leading-tight">
                                                                    {perm.permission_key}
                                                                </span>
                                                                {perm.description && (
                                                                    <span className="text-[11px] text-muted-foreground leading-snug">
                                                                        {perm.description}
                                                                    </span>
                                                                )}
                                                            </Label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                ) : null}
            </section>
        </div>
    );
}
