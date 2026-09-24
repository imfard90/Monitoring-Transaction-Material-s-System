import BasicTable from '@/app/components/utilities/basic-table/BasicTable';
import CheckboxTable from '@/app/components/utilities/checkbox-table/CheckboxTable';
import { EmployeesData } from '@/app/components/utilities/data';
import DataTable from '@/app/components/utilities/data-table/DataTable';
import HoverTable from '@/app/components/utilities/hover-table/HoverTable';
import StripedRowTable from '@/app/components/utilities/striped-row-table/StripedRowTable';
import BreadcrumbComp from '../../layout/shared/breadcrumb/BreadcrumbComp';

const BCrumb = [
    {
        to: '/',
        title: 'Home',
    },
    {
        title: 'Table',
    },
];

function page() {
    return (
        <>
            <BreadcrumbComp title="Table" items={BCrumb} />
            <div className="flex gap-6 flex-col ">
                <DataTable data={EmployeesData} />
                <BasicTable />
                <StripedRowTable />
                <HoverTable />
                <CheckboxTable />
            </div>
        </>
    );
}

export default page;
