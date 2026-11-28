import { ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function AccessDeniedState({
    title = 'Akses Ditolak',
    description = 'Anda tidak memiliki izin atau cakupan wilayah untuk mengakses halaman ini. Hubungi SuperUser atau Admin Regional bila memerlukan penyesuaian hak akses.',
    backHref = '/',
    backLabel = 'Kembali ke Dashboard',
}: {
    title?: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
}) {
    return (
        <div className="flex flex-1 items-center justify-center p-6">
            <Card className="w-full max-w-md border-destructive/30">
                <CardContent className="flex flex-col items-center gap-4 pt-8 pb-7 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                        <ShieldAlert aria-hidden="true" className="size-7" />
                    </div>
                    <div className="space-y-1.5">
                        <h1 className="text-lg font-semibold tracking-tight text-foreground">
                            {title}
                        </h1>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                    </div>
                    <Button asChild variant="outline" className="mt-2">
                        <Link href={backHref}>
                            <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
                            {backLabel}
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
