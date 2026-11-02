'use client';

import Image from 'next/image';
import Link from 'next/link';

const Logo = () => {
    return (
        <Link href={'/'} className="inline-flex items-center justify-center">
            <Image
                src={'/images/logos/logo-icon.svg'}
                alt="MTMS Logo"
                width={44}
                height={44}
                priority
                className="w-10 h-10 sm:w-11 sm:h-11 shrink-0"
            />
        </Link>
    );
};

export default Logo;
