export type HermesMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface HermesChatMessage {
    id: string;
    role: HermesMessageRole;
    content: string;
    createdAt: string;
}

export interface HermesToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface HermesMessagePayload {
    role: string;
    content: string | null;
    tool_calls?: HermesToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface HermesToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface HermesChatCompletionRequest {
    model: string;
    messages: HermesMessagePayload[];
    tools?: readonly HermesToolDefinition[] | HermesToolDefinition[];
    tool_choice?: 'auto' | 'none' | 'required';
    stream?: boolean;
    temperature?: number;
}

export interface HermesChatChoice {
    index: number;
    message: {
        role: string;
        content: string | null;
        tool_calls?: HermesToolCall[];
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

