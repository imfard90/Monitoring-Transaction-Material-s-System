'use client';
import { Icon } from '@iconify/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import SimpleBar from 'simplebar-react';
import { Input } from '@/components/ui/input';
import SidebarContent, { type ChildItem, type MenuItem } from '../sidebar/sidebaritems';

interface SearchResult {
    name: string;
    url: string;
    path: string | undefined;
    icon?: string;
}

// 🔍 Recursive search through menu (pure function, no deps on component state)
function searchItems(items: (MenuItem | ChildItem)[], q: string, parentPath = ''): SearchResult[] {
    let results: SearchResult[] = [];

    items.forEach((item) => {
        const currentPath = parentPath ? `${parentPath} → ${item.name}` : item.name;

        // If match found
        if (item.name?.toLowerCase().includes(q.toLowerCase()) && item.url) {
            results.push({
                name: item.name,
                url: item.url,
                path: currentPath,
                icon: item.icon,
            });
        }

        // Search deeper children
        if (item.children) {
            results = [...results, ...searchItems(item.children, q, currentPath)];
        }
    });

    return results;
}

function Search() {
    const [query, setQuery] = useState('');

    // Memoize filtered results
    const results = useMemo(() => {
        if (!query.trim()) return [];
        return searchItems(SidebarContent, query);
    }, [query]);

    const handleClear = () => {
        setQuery('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape' && query) {
            e.preventDefault();
            e.stopPropagation();
            setQuery('');
        }
    };

    return (
        <div className="relative w-full">
            <div className="flex items-center relative lg:w-xs mx-auto ">
                <Icon
                    icon="solar:magnifer-linear"
                    width="18"
                    height="18"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />

                <Input
                    placeholder="Search...."
                    className="rounded-xl pl-10 pr-9"
                    required
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />

                {query && (
                    <button
                        type="button"
                        aria-label="Hapus pencarian (Esc)"
                        title="Hapus pencarian (Esc)"
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-0.5 rounded-full"
                    >
                        <Icon icon="solar:close-circle-linear" width="18" height="18" />
                    </button>
                )}
            </div>
            <div
                className={`absolute w-full bg-background rounded-md top-11 z-10 start-0 shadow-md border border-border ${
                    query ? 'block' : 'hidden'
                }`}
            >
                <SimpleBar className="h-72 p-4 custom-scroll">
                    {results.length > 0 ? (
                        results.map((item, i) => (
                            <Link
                                key={item.url || i}
                                href={item.url}
                                onClick={() => setQuery('')}
                                className="p-2 mb-1.5 last:mb-0 flex items-center bg-input/30 gap-2 text-sm font-medium rounded-md hover:bg-primary/20 hover:text-primary w-full"
                            >
                                <div className="flex items-center">
                                    <Icon
                                        icon="solar:square-bottom-down-linear"
                                        width={20}
                                        height={20}
                                    />
                                    <div className="ps-3">
                                        <h5 className="mb-1 text-sm group-hover/link:text-primary">
                                            {item.name}
                                        </h5>
                                        <span className="text-xs block truncate text-muted-foreground">
                                            {item.path}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : query.trim() ? (
                        <p className="py-3 text-center text-sm text-muted-foreground" role="status">
                            Tidak ada halaman yang cocok.
                        </p>
                    ) : null}
                </SimpleBar>
            </div>
        </div>
    );
}

export default Search;
