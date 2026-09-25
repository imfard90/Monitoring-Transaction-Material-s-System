export const metadata = {
    title: 'Offline | MTMS',
};

export default function OfflinePage() {
    return (
        <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
            <h1 className="text-4xl font-bold">Anda Sedang Offline</h1>
            <p className="text-gray-500">Silakan periksa koneksi internet Anda.</p>
        </div>
    );
}
