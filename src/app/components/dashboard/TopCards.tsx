import { getDashboardKpis } from '@/app/(DashboardLayout)/_actions/dashboard-actions';
import { TopCardsCarousel } from './TopCardsCarousel';

export async function TopCards() {
    const result = await getDashboardKpis();
    const kpis =
        result.success && result.data
            ? (result.data as {
                  onlineUsers: number;
                  requestTag: number;
                  transitTag: number;
                  closeTag: number;
                  returnTek: number;
                  intechOpen: number;
                  intechClose: number;
                  stockInventoryRp: number;
                  stockIntechRp: number;
              })
            : {
                  onlineUsers: 0,
                  requestTag: 0,
                  transitTag: 0,
                  closeTag: 0,
                  returnTek: 0,
                  intechOpen: 0,
                  intechClose: 0,
                  stockInventoryRp: 0,
                  stockIntechRp: 0,
              };

    return <TopCardsCarousel kpis={kpis} />;
}
