import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { StockOpnameClient } from './_components/StockOpnameClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Stock Opname | MTMS',
};

export default async function StockOpnamePage() {
    const user = await getSessionUser();
    if (!user?.role) throw new Error('Unauthorized');

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
            />
        </div>
    );
}
