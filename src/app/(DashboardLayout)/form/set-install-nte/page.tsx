import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { getNteInventory } from './_actions/set-install-queries';
import SetInstallNteClient, { type InventoryOption } from './_components/SetInstallNteClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Set Install NTE | MTMS',
};

export default async function SetInstallNtePage() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');

    const result = await getNteInventory({ page: 1, pageSize: 100, inventoryStatus: 'available' });
    const inventory = result.data?.inventory ?? [];

    return (
        <div className="flex flex-col gap-4">
            <BreadcrumbComp
                title="Set Install NTE"
                items={[{ to: '/', title: 'Beranda' }, { title: 'Set Install NTE' }]}
            />
            <SetInstallNteClient
                snOptions={inventory as InventoryOption[]}
                addressOptions={[]}
                itemOptions={[]}
                technicianOptions={[]}
            />
        </div>
    );
}
