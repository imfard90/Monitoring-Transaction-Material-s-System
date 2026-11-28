'use client';

import { ShieldCheck, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserTable, { type UserItem } from '../user-table';
import { RolePermissionMatrix, type RolePermissionMatrixData } from './RolePermissionMatrix';
import type { ScopeHierarchyData } from './UserScopeModal';

export function UsersManagementTabs({
    users,
    hierarchy,
    roleMatrix,
}: {
    users: UserItem[];
    hierarchy: ScopeHierarchyData;
    roleMatrix: RolePermissionMatrixData;
}) {
    return (
        <Tabs defaultValue="users" className="flex flex-col flex-1 w-full min-w-0 min-h-0">
            <div className="border-b border-border px-4 py-2.5 flex items-center justify-between gap-2 bg-muted/20 shrink-0">
                <TabsList className="h-9">
                    <TabsTrigger value="users" className="gap-1.5 text-xs px-3">
                        <Users className="size-3.5" />
                        <span>Daftar Pengguna</span>
                    </TabsTrigger>
                    <TabsTrigger value="permissions" className="gap-1.5 text-xs px-3">
                        <ShieldCheck className="size-3.5" />
                        <span>Matriks Role &amp; Wewenang</span>
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="users" className="mt-0 flex-1 min-h-0 overflow-y-auto">
                <UserTable data={users} hierarchy={hierarchy} />
            </TabsContent>

            <TabsContent value="permissions" className="mt-0 flex-1 min-h-0 overflow-y-auto">
                <RolePermissionMatrix initialData={roleMatrix} />
            </TabsContent>
        </Tabs>
    );
}
