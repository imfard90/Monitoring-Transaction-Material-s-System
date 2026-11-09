export type HermesMessageRole = 'system' | 'user' | 'assistant';

export interface HermesChatMessage {
    id: string;
    role: HermesMessageRole;
    content: string;
    createdAt: string;
}

export interface HermesChatCompletionRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    stream?: boolean;
    temperature?: number;
}

export interface HermesChatChoice {
    index: number;
    message: {
        role: string;
        content: string;
        reasoning_content?: string;
    };
    finish_reason?: string;
}

export interface HermesChatCompletionResponse {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: HermesChatChoice[];
    error?: {
        message: string;
        type?: string;
        code?: string | number;
    };
}

