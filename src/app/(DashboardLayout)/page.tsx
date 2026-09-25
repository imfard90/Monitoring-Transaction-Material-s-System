import { Footer } from '../components/dashboard/Footer';
import OutMaterialLineChart from '../components/dashboard/OutMaterialLineChart';
import { ProductPerformance } from '../components/dashboard/ProductPerformance';
import ProfileWelcome from '../components/dashboard/ProfileWelcome';
import { RecentTransaction } from '../components/dashboard/RecentTransaction';
import SalesOverview from '../components/dashboard/SalesOverview';
import { StockWarningTable } from '../components/dashboard/StockWarningTable';
import { TopCards } from '../components/dashboard/TopCards';

const page = () => {
    return (
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
                <RecentTransaction />
            </div>
            <div className="col-span-12">
                <OutMaterialLineChart />
            </div>
            <div className="col-span-12 lg:col-span-8 flex">
                <StockWarningTable />
            </div>
            <div className="col-span-12 lg:col-span-4 flex">
                <ProductPerformance />
            </div>
            <div className="col-span-12">
                <Footer />
            </div>
        </div>
    );
};

export default page;
