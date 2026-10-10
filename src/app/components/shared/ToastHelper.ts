'use client';

import { toast as sonnerToast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

export const toast = {
    success: (message: string, description?: string) => {
        sonnerToast.success(message, { description });
    },
    error: (message: string, description?: string) => {
        sonnerToast.error(message, { description });
    },
    info: (message: string, description?: string) => {
        sonnerToast.info(message, { description });
    },
    warning: (message: string, description?: string) => {
        sonnerToast.warning(message, { description });
    },
    loading: (message: string) => {
        return sonnerToast.loading(message);
    },
    promise: <T>(
        promise: Promise<T>,
        messages: {
            loading: string;
            success: string | ((data: T) => string);
            error: string | ((error: unknown) => string);
        }
    ) => {
        return sonnerToast.promise(promise, messages);
    },
    dismiss: (id?: string | number) => {
        sonnerToast.dismiss(id);
    },
};

// Standardized messages for common MTMS operations
export const standardToasts = {
    saved: () => toast.success('Data berhasil disimpan'),
    updated: () => toast.success('Data berhasil diperbarui'),
    deleted: () => toast.success('Data berhasil dihapus'),
    approved: () => toast.success('Transaksi berhasil disetujui'),
    rejected: () => toast.success('Transaksi berhasil ditolak'),
    cancelled: () => toast.success('Transaksi berhasil dibatalkan'),
    exported: () => toast.success('Data berhasil diekspor'),
    imported: () => toast.success('Data berhasil diimpor'),

    // Error messages
    saveFailed: (err: unknown) => toast.error('Gagal menyimpan', getErrorMessage(err)),
    loadFailed: (err: unknown) => toast.error('Gagal memuat data', getErrorMessage(err)),
    deleteFailed: (err: unknown) => toast.error('Gagal menghapus', getErrorMessage(err)),
    validationFailed: () => toast.error('Validasi gagal', 'Periksa kembali input Anda'),
    networkError: () => toast.error('Kesalahan jaringan', 'Periksa koneksi Anda'),
    unauthorized: () => toast.error('Tidak memiliki akses', 'Silakan login kembali'),
    serverError: () => toast.error('Kesalahan server', 'Silakan coba lagi nanti'),

    // Loading messages
    saving: () => toast.loading('Menyimpan data...'),
    loading: () => toast.loading('Memuat data...'),
    processing: () => toast.loading('Memproses...'),
};

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Terjadi kesalahan tidak dikenal';
}
