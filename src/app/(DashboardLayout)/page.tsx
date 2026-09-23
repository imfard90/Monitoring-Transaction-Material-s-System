import React from 'react';
import { Footer } from '../components/dashboard/Footer';
import { MonthlyEarning } from '../components/dashboard/MonthlyEarning';
import { ProductPerformance } from '../components/dashboard/ProductPerformance';
import ProfileWelcome from '../components/dashboard/ProfileWelcome';
import { RecentTransaction } from '../components/dashboard/RecentTransaction';
import SalesOverview from '../components/dashboard/SalesOverview';
import { StockIntechOverview } from '../components/dashboard/StockIntechOverview';
import { TopCards } from '../components/dashboard/TopCards';
import { YearlyBreakup } from '../components/dashboard/YearlyBreakup';

const page = () => {
    return (
        <>
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12">
                    <ProfileWelcome />
                </div>
                <div className="col-span-12">
                    <TopCards />
                </div>
                <div className="lg:col-span-8 col-span-12">
                    <SalesOverview />
                </div>
                <div className="lg:col-span-4 col-span-12">
                    <div className="grid grid-cols-12 gap-6">
                        <div className="col-span-12">
                            <YearlyBreakup />
                        </div>
                        <div className="col-span-12">
                            <MonthlyEarning />
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4 col-span-12">
                    <RecentTransaction />
                </div>
                <div className="lg:col-span-8 col-span-12 flex">
                    <ProductPerformance />
                </div>
                <div className="col-span-12">
                    <StockIntechOverview />
                </div>
                <div className="col-span-12">
                    <Footer />
                </div>
            </div>
        </>
    );
};

export default page;
