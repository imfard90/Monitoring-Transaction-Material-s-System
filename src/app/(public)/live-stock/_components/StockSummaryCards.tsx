'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { LiveStockData } from '../_lib/stock-status';

interface StockSummaryCardsProps {
    data: LiveStockData['summary'];
}

export function StockSummaryCards({ data }: StockSummaryCardsProps) {
    const cards = [
        { title: 'Total Material', value: data.total_materials, accent: 'text-primary' },
        { title: 'Total Stok', value: data.total_qty, accent: 'text-success' },
        { title: 'Item Kritis', value: data.critical_items, accent: 'text-destructive' },
    ];

    return (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {cards.map((card) => (
                <Card key={card.title} className="border-border/70 shadow-sm">
                    <CardContent className="px-4 py-3">
                        <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                        <p
                            className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${card.accent}`}
                        >
                            {card.value.toLocaleString('id-ID')}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
