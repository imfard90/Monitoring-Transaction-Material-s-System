import { CheckCircle, Clock, FileEdit, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface OutMaterialCardsProps {
    counts: {
        wait_approve: number;
        request: number;
        intech: number;
        close: number;
    };
    activeFilter: string;
    onFilterChange: (filter: string) => void;
}

export default function OutMaterialCards({
    counts,
    activeFilter,
    onFilterChange,
}: OutMaterialCardsProps) {
    const cards = [
        {
            id: 'all',
            title: 'All Materials',
            value: counts.wait_approve + counts.request + counts.intech + counts.close,
            icon: <FileEdit className="text-gray-500" size={24} />,
            color: 'bg-gray-500/10',
        },
        {
            id: 'wait_approve',
            title: 'Wait Approve',
            value: counts.wait_approve,
            icon: <Clock className="text-yellow-500" size={24} />,
            color: 'bg-yellow-500/10',
        },
        {
            id: 'request',
            title: 'Requested',
            value: counts.request,
            icon: <FileEdit className="text-blue-500" size={24} />,
            color: 'bg-blue-500/10',
        },
        {
            id: 'intech',
            title: 'Intech',
            value: counts.intech,
            icon: <Truck className="text-purple-500" size={24} />,
            color: 'bg-purple-500/10',
        },
        {
            id: 'close',
            title: 'Close',
            value: counts.close,
            icon: <CheckCircle className="text-green-500" size={24} />,
            color: 'bg-green-500/10',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-1">
            {cards.map((card) => (
                <Card
                    key={card.id}
                    className={cn(
                        'cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg border-none',
                        card.color,
                        activeFilter === card.id ? 'ring-2 ring-primary shadow-md' : ''
                    )}
                    onClick={() => onFilterChange(card.id)}
                >
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">{card.title}</p>
                            <h3 className="text-2xl font-bold text-gray-900">{card.value}</h3>
                        </div>
                        <div className="p-3 bg-white/50 rounded-full">{card.icon}</div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
