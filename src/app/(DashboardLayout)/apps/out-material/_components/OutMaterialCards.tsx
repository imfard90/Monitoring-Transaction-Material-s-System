import { CheckCircle, Clock, FileEdit, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer } from '@/components/ui/motion/stagger-container';
import { StaggerItem } from '@/components/ui/motion/stagger-item';
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
            title: 'Semua Material',
            value: counts.wait_approve + counts.request + counts.intech + counts.close,
            icon: <FileEdit className="text-secondary w-5 h-5" />,
            color: 'bg-secondary/10',
        },
        {
            id: 'wait_approve',
            title: 'Menunggu Persetujuan',
            value: counts.wait_approve,
            icon: <Clock className="text-warning w-5 h-5" />,
            color: 'bg-warning/10',
        },
        {
            id: 'request',
            title: 'Permintaan',
            value: counts.request,
            icon: <FileEdit className="text-info w-5 h-5" />,
            color: 'bg-info/10',
        },
        {
            id: 'intech',
            title: 'Intech (Teknisi)',
            value: counts.intech,
            icon: <Truck className="text-secondary w-5 h-5" />,
            color: 'bg-secondary/10',
        },
        {
            id: 'close',
            title: 'Selesai',
            value: counts.close,
            icon: <CheckCircle className="text-success w-5 h-5" />,
            color: 'bg-success/10',
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
                        <CardContent className="p-3.5 sm:p-4 flex items-center justify-between h-full min-h-[84px] sm:min-h-[88px] gap-2">
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
