import type React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AuthCardProps {
    children: React.ReactNode;
    title: string;
    description?: string;
    className?: string;
}

const AuthCard: React.FC<AuthCardProps> = ({ children, title, description, className }) => {
    return (
        <Card
            className={cn(
                'border-border/70 bg-card/95 backdrop-blur-md shadow-xl shadow-primary/5 dark:shadow-none rounded-2xl transition-all duration-300',
                className
            )}
        >
            <CardContent className="pt-6 sm:pt-8 px-5 sm:px-8">
                <div className={title || description ? 'text-center mb-7 sm:mb-8' : 'mb-0'}>
                    {title ? (
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                            {title}
                        </h1>
                    ) : null}
                    {description && (
                        <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">
                            {description}
                        </p>
                    )}
                </div>
                {children}
            </CardContent>
        </Card>
    );
};

export default AuthCard;
