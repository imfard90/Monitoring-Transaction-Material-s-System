'use client';
import type React from 'react';
import {
    createContext,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
    useEffect,
    useState,
} from 'react';
import type { BlogPostType, BlogType } from '@/app/(DashboardLayout)/types/blog';

export interface BlogContextProps {
    posts: BlogPostType[];
    sortBy: string;
    selectedPost: BlogPostType | null;
    isLoading: boolean;
    setPosts: Dispatch<SetStateAction<BlogPostType[]>>;
    setSortBy: Dispatch<SetStateAction<string>>;
    setSelectedPost: Dispatch<SetStateAction<BlogPostType | null>>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    addComment: (postId: string, newComment: BlogType) => void;
    fetchPostById: (id: string) => Promise<void>;
    error: string | Error | null;
}

export const BlogContext = createContext<BlogContextProps>({
    posts: [],
    sortBy: 'newest',
    selectedPost: null,
    isLoading: true,
    setPosts: () => {},
    setSortBy: () => {},
    setSelectedPost: () => {},
    setLoading: () => {},
    addComment: () => {},
    fetchPostById: async () => {},
    error: null,
});

export const BlogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [posts, setPosts] = useState<BlogPostType[]>([]);
    const [sortBy, setSortBy] = useState<string>('newest');
    const [selectedPost, setSelectedPost] = useState<BlogPostType | null>(null);
    const [isLoading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | Error | null>(null);

    // Fetch all posts
    const fetchPosts = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/blog');
            const data = await res.json();
            if (data.status === 200) {
                setPosts(data.data);
                setError(null);
            } else {
                setError(data.msg);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err : String(err));
        } finally {
            setLoading(false);
        }
    };

    // Fetch single post
    const fetchPostById = async (id: string) => {
        try {
            setLoading(true);
            const res = await fetch(`/api/blog/${id}`);
            const data = await res.json();
            if (data.status === 200) {
                setSelectedPost(data.data);
                setError(null);
            } else {
                setError(data.msg);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err : String(err));
        } finally {
            setLoading(false);
        }
    };

    // Add comment locally + optionally call API
    const addComment = async (postId: string, newComment: BlogType) => {
        setPosts((prevPosts) =>
            prevPosts.map((post) =>
                post.id === postId
                    ? { ...post, comments: [newComment, ...(post.comments || [])] }
                    : post
            )
        );

        try {
            await fetch('/api/blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId, comment: newComment }),
            });
        } catch (err) {
            console.error('Failed to save comment:', err);
        }
    };

    // Fetch posts initially
    useEffect(() => {
        fetchPosts();
    }, []);

    const value: BlogContextProps = {
        posts,
        sortBy,
        selectedPost,
        isLoading,
        setPosts,
        setSortBy,
        setSelectedPost,
        setLoading,
        addComment,
        fetchPostById,
        error,
    };

    return <BlogContext.Provider value={value}>{children}</BlogContext.Provider>;
};
