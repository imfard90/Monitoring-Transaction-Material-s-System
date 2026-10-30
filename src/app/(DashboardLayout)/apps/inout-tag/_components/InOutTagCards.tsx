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
            title: 'Semua Tag',
            value: counts.requested + counts.in_transit + counts.closed + counts.cancel,
            icon: <Warehouse className="text-secondary w-5 h-5" />,
            color: 'bg-secondary/10',
        },
        {
            id: 'requested',
            title: 'Permintaan',
            value: counts.requested,
            icon: <FileEdit className="text-info w-5 h-5" />,
            color: 'bg-info/10',
        },
        {
            id: 'in_transit',
            title: 'Dalam Transit',
            value: counts.in_transit,
            icon: <Truck className="text-warning w-5 h-5" />,
            color: 'bg-warning/10',
        },
        {
            id: 'closed',
            title: 'Selesai',
            value: counts.closed,
            icon: <CheckCircle className="text-success w-5 h-5" />,
            color: 'bg-success/10',
        },
        {
            id: 'cancel',
            title: 'Dibatalkan',
            value: counts.cancel,
            icon: <XCircle className="text-error w-5 h-5" />,
            color: 'bg-error/10',
        },
    ];

    return (
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 p-0.5">
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
                        <CardContent className="p-3.5 sm:p-4 flex items-center justify-between h-full min-h-21 sm:min-h-22 gap-2">
                            <div className="min-w-0 flex-1">
                                <p
                                    className="text-xs sm:text-sm font-medium text-foreground mb-0.5 sm:mb-1 truncate"
                                    title={card.title}
                                >
                                    {card.title}
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                                    {card.value}
                                </h3>
                            </div>
                            <div className="p-2 sm:p-2.5 bg-background/50 rounded-full shrink-0">
                                {card.icon}
                            </div>
                        </CardContent>
                    </Card>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
}
