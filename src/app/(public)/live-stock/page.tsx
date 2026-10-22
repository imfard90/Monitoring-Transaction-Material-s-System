import type { Metadata } from 'next';
import { getLiveStockData } from './_actions/live-stock-queries';
import { LiveStockClient } from './LiveStockClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
    title: 'Live Stock',
    description: 'Posisi stok seluruh gudang secara real-time.',
};

export default async function LiveStockPage() {
    const stockData = await getLiveStockData();

    return <LiveStockClient initialData={stockData} />;
}
