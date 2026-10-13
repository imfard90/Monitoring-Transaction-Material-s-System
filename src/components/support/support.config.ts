export const supportChannels = {
    whatsapp: {
        id: 'whatsapp',
        label: 'WhatsApp',
        description: 'Hubungi tim support melalui WhatsApp',
        href: 'https://wa.me/6282334447478',
        availability: 'available',
    },
    telegram: {
        id: 'telegram',
        label: 'Telegram',
        description: 'Hubungi tim support melalui Telegram',
        href: 'https://t.me/imfard',
        availability: 'available',
    },
    agentChat: {
        id: 'agent-chat',
        label: 'Agent Chat',
        description: 'Percakapan langsung dengan Agent MTMS',
        availability: 'coming-soon',
    },
} as const;

export type SupportChannel = keyof typeof supportChannels;
