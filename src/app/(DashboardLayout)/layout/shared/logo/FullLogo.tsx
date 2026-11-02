'use client';

import Image from 'next/image';

const FullLogo = () => {
    return (
        <>
            {/* Dark Logo (Mode Terang dengan atap kontras tinggi dan siluet tegas) */}
            <Image
                src="/images/logos/dark-logo.svg"
                alt="Warehouse MTMS Logo"
                width={220}
                height={45}
                priority
                className="block dark:hidden rtl:-scale-x-100 shrink-0 w-51.25 sm:w-55 h-auto object-contain"
            />
            {/* Light Logo (Mode Gelap dengan tipografi dan atap terang cerah) */}
            <Image
                src="/images/logos/light-logo.svg"
                alt="Warehouse MTMS Logo"
                width={220}
                height={45}
                priority
                className="hidden dark:block rtl:-scale-x-100 shrink-0 w-51.25 sm:w-55 h-auto object-contain"
            />
        </>
    );
};

export default FullLogo;
