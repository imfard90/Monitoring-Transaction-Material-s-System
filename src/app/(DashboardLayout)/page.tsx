import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LensaPerformance } from '@/components/dashboard/LensaPerformance';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { Skeleton } from '@/components/ui/skeleton';
import { getPageSessionUser } from '@/lib/auth-server';
import { Footer } from '../components/dashboard/Footer';
import { IntechAgingPanel } from '../components/dashboard/IntechAgingPanel';
import OutMaterialLineChart from '../components/dashboard/OutMaterialLineChart';
import { ProductPerformance } from '../components/dashboard/ProductPerformance';
import ProfileWelcome from '../components/dashboard/ProfileWelcome';
import { RecentTransaction } from '../components/dashboard/RecentTransaction';
import SalesOverview from '../components/dashboard/SalesOverview';
import StockValueDonutChart from '../components/dashboard/StockValueDonutChart';
import { StockWarningTable } from '../components/dashboard/StockWarningTable';
import { TopCards } from '../components/dashboard/TopCards';

export const metadata: Metadata = {
    title: 'Dashboard Utama',
    description: 'Monitoring KPI dan pergerakan material sistem MTMS',
};

// This page calls getSessionUser() which reads request headers,
// so it must always be rendered dynamically (never statically pre-rendered).
export const dynamic = 'force-dynamic';

function ProfileSkeleton() {
    return (
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-card p-3 sm:px-5 sm:py-3.5">
            <Skeleton className="h-11 w-11 sm:h-12 sm:w-12 rounded-full" />
            <div className="space-y-1.5">
                <Skeleton className="h-4.5 w-44" />
                <Skeleton className="h-3.5 w-32" />
            </div>
        </div>
    );
}

function KpiSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['kpi-skel-1', 'kpi-skel-2', 'kpi-skel-3', 'kpi-skel-4'].map((skelId) => (
                <Skeleton key={skelId} className="h-24 rounded-xl" />
            ))}
        </div>
    );
}

export default async function Page() {
    const user = await getPageSessionUser();
    const warehouseResult = await import('./_actions/dashboard-actions').then(({ getWarehouses }) =>
        getWarehouses()
    );
    const isStaff = user.isStaff;
    const warehouses =
        warehouseResult.success && warehouseResult.data
            ? warehouseResult.data.map(({ id, name }) => ({ id, name }))
            : [];

    return (
        <div className="flex flex-col flex-1 h-full gap-4">
            <h1 className="sr-only">Dashboard Utama</h1>
            <StaggerContainer className="grid grid-cols-12 gap-4 lg:items-stretch">
                <StaggerItem className="col-span-12">
                    <Suspense fallback={<ProfileSkeleton />}>
                        <ProfileWelcome />
                    </Suspense>
                </StaggerItem>

                <StaggerItem className="col-span-12">
                    <Suspense fallback={<KpiSkeleton />}>
                        <TopCards />
                    </Suspense>
                </StaggerItem>

                {/* Baris 1: SalesOverview & Top Out Material */}
                <StaggerItem className="col-span-12 lg:col-span-8">
                    <SalesOverview isStaff={isStaff} warehouses={warehouses} />
                </StaggerItem>

                <StaggerItem className="col-span-12 lg:col-span-4">
                    <RecentTransaction isStaff={isStaff} warehouses={warehouses} />
                </StaggerItem>

                {/* Baris 2: Dedicated Panel Aging Stok Intech (2 Charts: Donut Tiers + Top Material Intech) */}
                <StaggerItem className="col-span-12">
                    <IntechAgingPanel isStaff={isStaff} warehouses={warehouses} />
                </StaggerItem>

                {/* Baris 3: Stock Value Donut & Out Material Line Chart */}
                <StaggerItem className="col-span-12">
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-stretch">
                        <div className="lg:col-span-3 min-w-0 flex">
                            <StockValueDonutChart isStaff={isStaff} warehouses={warehouses} />
                        </div>
                        <div className="lg:col-span-7 min-w-0 flex">
                            <OutMaterialLineChart isStaff={isStaff} warehouses={warehouses} />
                        </div>
                    </div>
                </StaggerItem>

                {/* Baris 4: Stock Warning Table & Warehouse Performance */}
                <StaggerItem className="col-span-12 lg:col-span-8 min-w-0 relative">
                    <div className="flex flex-col h-[520px] lg:h-full lg:absolute lg:inset-0">
                        <StockWarningTable isStaff={isStaff} warehouses={warehouses} />
                    </div>
                </StaggerItem>

                <StaggerItem className="col-span-12 lg:col-span-4 min-w-0 flex flex-col">
                    <div className="flex flex-col gap-4">
                        <ProductPerformance />
                        <Suspense fallback={<KpiSkeleton />}>
                            <LensaPerformance />
                        </Suspense>
                    </div>
                </StaggerItem>
            </StaggerContainer>
            <Footer />
        </div>
    );
}
