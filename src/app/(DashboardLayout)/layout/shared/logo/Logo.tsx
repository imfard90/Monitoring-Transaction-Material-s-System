'use client';

import Image from 'next/image';
import Link from 'next/link';

const Logo = () => {
    return (
        <Link href={'/'} className="inline-flex items-center justify-center">
            <Image
                src={'/images/logos/logo-icon.svg'}
                alt="logo"
                width={36}
                height={36}
                priority
                className="w-9 h-9 shrink-0"
            />
        </Link>
    );
};

export default Logo;
