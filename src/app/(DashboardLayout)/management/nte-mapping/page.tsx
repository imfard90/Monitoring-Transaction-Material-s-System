import type { Metadata } from 'next';
import { requireManagementAccess } from '@/lib/auth-server';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';
import { getNteAddressWarehouseMappings } from './actions';
import NteMappingTable, { type Mapping, type Warehouse } from './nte-mapping-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Mapping Gudang NTE',
    description: 'Kelola pemetaan alamat NTE ke gudang MTMS',
};

export default async function NteMappingPage() {
    await requireManagementAccess();
    const data = await getNteAddressWarehouseMappings();

    return (
        <div className="flex flex-col gap-4">
            <BreadcrumbComp
                title="Mapping Gudang NTE"
                items={[
                    { to: '/', title: 'Beranda' },
                    { to: '#', title: 'Manajemen' },
                    { title: 'Mapping Gudang NTE' },
                ]}
            />
            <NteMappingTable
                mappings={data.mappings as Mapping[]}
                warehouses={data.warehouses as Warehouse[]}
            />
        </div>
    );
}
