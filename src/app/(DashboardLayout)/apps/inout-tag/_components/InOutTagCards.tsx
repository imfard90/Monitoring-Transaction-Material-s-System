import { CheckCircle, FileEdit, Truck, Warehouse, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
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
            icon: <Warehouse className="text-secondary" size={24} />,
            color: 'bg-secondary/10',
        },
        {
            id: 'requested',
            title: 'Request',
            value: counts.requested,
            icon: <FileEdit className="text-info" size={24} />,
            color: 'bg-info/10',
        },
        {
            id: 'in_transit',
            title: 'Transit',
            value: counts.in_transit,
            icon: <Truck className="text-warning" size={24} />,
            color: 'bg-warning/10',
        },
        {
            id: 'closed',
            title: 'Closed',
            value: counts.closed,
            icon: <CheckCircle className="text-success" size={24} />,
            color: 'bg-success/10',
        },
        {
            id: 'cancel',
            title: 'Cancel',
            value: counts.cancel,
            icon: <XCircle className="text-error" size={24} />,
            color: 'bg-error/10',
        },
    ];

    return (
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-5 gap-4 p-1">
            {cards.map((card) => (
                <StaggerItem key={card.id}>
                    <Card
                        className={cn(
                            'cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg border-none h-full',
                            card.color,
                            activeFilter === card.id ? 'ring-2 ring-primary shadow-md' : ''
                        )}
                        onClick={() => onFilterChange(card.id)}
                    >
                        <CardContent className="p-4 flex items-center justify-between h-full">
                            <div>
                                <p className="text-sm font-medium text-foreground mb-1">
                                    {card.title}
                                </p>
                                <h3 className="text-2xl font-bold text-foreground">{card.value}</h3>
                            </div>
                            <div className="p-3 bg-background/50 rounded-full">{card.icon}</div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
}
