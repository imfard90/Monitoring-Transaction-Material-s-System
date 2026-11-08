import type { Metadata } from 'next';
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { getSessionUser } from '@/lib/auth-server';
import { getNteAddresses, getNteTechnicians } from './_actions/return-nte-queries';
import ReturnNteClient from './_components/ReturnNteClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Return NTE | MTMS',
};

export default async function ReturnNtePage() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');

    const [addressesResult, techniciansResult] = await Promise.all([
        getNteAddresses(),
        getNteTechnicians(),
    ]);

    return (
        <div className="flex flex-col gap-4">
            <BreadcrumbComp
                title="Return NTE"
                items={[{ to: '/', title: 'Beranda' }, { title: 'Return NTE' }]}
            />
            <ReturnNteClient
                addressOptions={
                    Array.isArray(addressesResult.data?.[0]) ? addressesResult.data[0] : []
                }
                technicianOptions={
                    Array.isArray(techniciansResult.data?.[0]) ? techniciansResult.data[0] : []
                }
            />
        </div>
    );
}
