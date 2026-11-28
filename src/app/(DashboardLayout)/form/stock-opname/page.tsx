import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { AccessDeniedState } from '@/components/auth/AccessDeniedState';
import { getPageSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { hasPermission } from '@/lib/policies';
import { StockOpnameClient } from './_components/StockOpnameClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Stock Opname | MTMS',
};

export default async function StockOpnamePage() {
    const user = await getPageSessionUser();
    if (
        !hasPermission(user, 'stock_opname:input') &&
        !hasPermission(user, 'stock_opname:approve')
    ) {
        return (
            <AccessDeniedState description="Anda tidak memiliki izin untuk mengakses halaman Stock Opname." />
        );
    }

    const masterWarehouses = await db
        .selectFrom('inventory.mas_wh')
        .select(['id', 'name'])
        .orderBy('name', 'asc')
        .execute()
        .catch(() => []);

    return (
        <div className="flex flex-col gap-4">
            <BreadcrumbComp
                title="Stock Opname"
                items={[{ to: '/', title: 'Home' }, { title: 'Form' }, { title: 'Stock Opname' }]}
            />
            <StockOpnameClient
                user={{
                    nik: user.nik,
                    role: user.role ?? 'staff',
                    warehouseIds: user.warehouseIds,
                }}
                masterWarehouses={masterWarehouses}
            />
        </div>
    );
}
