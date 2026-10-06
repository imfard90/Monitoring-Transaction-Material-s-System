import { Suspense } from 'react';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
import { Skeleton } from '@/components/ui/skeleton';
import { Footer } from '../components/dashboard/Footer';
import OutMaterialLineChart from '../components/dashboard/OutMaterialLineChart';
import { ProductPerformance } from '../components/dashboard/ProductPerformance';
import ProfileWelcome from '../components/dashboard/ProfileWelcome';
import { RecentTransaction } from '../components/dashboard/RecentTransaction';
import SalesOverview from '../components/dashboard/SalesOverview';
import { StockWarningTable } from '../components/dashboard/StockWarningTable';
import { TopCards } from '../components/dashboard/TopCards';

function ProfileSkeleton() {
    return (
        <div className="flex items-center gap-4 rounded-xl border bg-card p-6">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
            </div>
        </div>
    );
}

function KpiSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`kpi-skeleton-${i}`} className="h-24 rounded-xl" />
            ))}
        </div>
    );
}

export default function Page() {
    return (
        <div className="flex flex-col flex-1 h-full gap-6">
            <StaggerContainer className="grid grid-cols-12 gap-6">
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

                <StaggerItem className="col-span-12 lg:col-span-8">
                    <SalesOverview />
                </StaggerItem>

                <StaggerItem className="col-span-12 lg:col-span-4">
                    <RecentTransaction />
                </StaggerItem>

                <StaggerItem className="col-span-12">
                    <OutMaterialLineChart />
                </StaggerItem>

                <StaggerItem className="col-span-12 lg:col-span-8 flex">
                    <StockWarningTable />
                </StaggerItem>

                <StaggerItem className="col-span-12 lg:col-span-4 flex">
                    <ProductPerformance />
                </StaggerItem>
            </StaggerContainer>
            <Footer />
        </div>
    );
}
