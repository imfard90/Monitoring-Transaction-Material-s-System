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
import { RekonSlaVelocity } from '../components/dashboard/RekonSlaVelocity';
import SalesOverview from '../components/dashboard/SalesOverview';
import { StockRunoutForecast } from '../components/dashboard/StockRunoutForecast';
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
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-card px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 sm:h-16 sm:w-16 rounded-full shrink-0" />
                <div className="space-y-2">
                    <Skeleton className="h-5 sm:h-6 w-48 sm:w-60" />
                    <Skeleton className="h-4 w-36 sm:w-44" />
                </div>
            </div>
            <div className="hidden sm:flex items-center gap-3">
                <Skeleton className="h-9.5 w-36 rounded-xl" />
                <Skeleton className="h-9.5 w-28 rounded-xl" />
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
        getWarehouses(user)
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

                {/* Baris 3: Ketahanan Stok (Days of Supply) & SLA Kecepatan Rekon */}
                <StaggerItem className="col-span-12">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                        <div className="lg:col-span-8 min-w-0 flex">
                            <StockRunoutForecast isStaff={isStaff} warehouses={warehouses} />
                        </div>
                        <div className="lg:col-span-4 min-w-0 flex">
                            <RekonSlaVelocity isStaff={isStaff} warehouses={warehouses} />
                        </div>
                    </div>
                </StaggerItem>

                {/* Baris 4: Stock Value Donut & Out Material Line Chart */}
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
                    <div className="flex flex-col h-130 lg:h-full lg:absolute lg:inset-0">
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
