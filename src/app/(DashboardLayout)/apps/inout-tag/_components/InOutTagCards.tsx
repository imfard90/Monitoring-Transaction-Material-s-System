import { CheckCircle, FileEdit, Truck, Warehouse, XCircle } from 'lucide-react';
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface InOutTagCardsProps {
    counts: {
        requested: number;
        in_transit: number;
        closed: number;
        cancel: number;
    };
    activeFilter: string;
    onFilterChange: (filter: string) => void;
}

export default function InOutTagCards({
    counts,
    activeFilter,
    onFilterChange,
}: InOutTagCardsProps) {
    const cards = [
        {
            id: 'all',
            title: 'All Tags',
            value: counts.requested + counts.in_transit + counts.closed + counts.cancel,
            icon: <Warehouse className="text-gray-500" size={24} />,
            color: 'bg-gray-500/10',
        },
        {
            id: 'requested',
            title: 'Request',
            value: counts.requested,
            icon: <FileEdit className="text-blue-500" size={24} />,
            color: 'bg-blue-500/10',
        },
        {
            id: 'in_transit',
            title: 'Transit',
            value: counts.in_transit,
            icon: <Truck className="text-yellow-500" size={24} />,
            color: 'bg-yellow-500/10',
        },
        {
            id: 'closed',
            title: 'Closed',
            value: counts.closed,
            icon: <CheckCircle className="text-green-500" size={24} />,
            color: 'bg-green-500/10',
        },
        {
            id: 'cancel',
            title: 'Cancel',
            value: counts.cancel,
            icon: <XCircle className="text-red-500" size={24} />,
            color: 'bg-red-500/10',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {cards.map((card) => (
                <Card
                    key={card.id}
                    className={cn(
                        'cursor-pointer transition-all hover:shadow-md border-none',
                        card.color,
                        activeFilter === card.id ? 'ring-2 ring-primary shadow-md' : ''
                    )}
                    onClick={() => onFilterChange(card.id)}
                >
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">{card.title}</p>
                            <h3 className="text-3xl font-bold text-gray-900">{card.value}</h3>
                        </div>
                        <div className="p-3 bg-white/50 rounded-full">{card.icon}</div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
