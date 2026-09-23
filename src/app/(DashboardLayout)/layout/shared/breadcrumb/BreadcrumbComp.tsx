'use client';

import Image from 'next/image';
import Link from 'next/link';
import CardBox from '@/app/components/shared/CardBox';

interface BreadcrumbItem {
    title: string;
    to?: string;
}

interface BreadCrumbType {
    title: string;
    items?: BreadcrumbItem[];
}

const BreadcrumbComp = ({ items = [], title }: BreadCrumbType) => {
    return (
        <CardBox className="mb-6 py-4 bg-lightsecondary overflow-hidden rounded-md border-none shadow-none relative">
            <div className="grid grid-cols-12 gap-6 items-center">
                <div className="col-span-10">
                    <h4 className="font-semibold text-xl mb-3">{title}</h4>

                    <ol className="flex items-center whitespace-nowrap" aria-label="Breadcrumb">
                        {items.map((item, index) => {
                            const isLast = index === items.length - 1;

                            return (
                                <li key={index} className="flex items-center">
                                    {item.to && !isLast ? (
                                        <Link
                                            href={item.to}
                                            className="text-sm text-muted-foreground opacity-80 leading-none hover:underline"
                                        >
                                            {item.title}
                                        </Link>
                                    ) : (
                                        <span
                                            className="text-sm text-muted-foreground leading-none"
                                            aria-current={isLast ? 'page' : undefined}
                                        >
                                            {item.title}
                                        </span>
                                    )}

                                    {!isLast && (
                                        <span className="mx-2.5 h-1 w-1 rounded-full bg-muted-foreground" />
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <div className="col-span-2 flex justify-center -mb-7 max-h-[120px] max-w-[140px]">
                    <div className="hidden sm:block absolute right-7 bottom-0">
                        <Image
                            src="/images/dashboard/customer-support-img.png"
                            alt="support-img"
                            width={145}
                            height={95}
                        />
                    </div>
                </div>
            </div>
        </CardBox>
    );
};

export default BreadcrumbComp;
