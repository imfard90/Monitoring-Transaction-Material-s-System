import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getPageSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { StockOpnameClient } from './_components/StockOpnameClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Stock Opname | MTMS',
};

export default async function StockOpnamePage() {
    const user = await getPageSessionUser();
    if (!user?.role) {
        redirect('/auth/login');
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
                items={[{ to: '/', title: 'Beranda' }, { title: 'Stock Opname' }]}
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
