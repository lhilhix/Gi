
export enum ModelId {
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_3_PRO = 'gemini-3-pro-preview',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash',
  GEMINI_IMAGE = 'gemini-2.5-flash-image',
  GROQ_LLAMA_3_3 = 'llama-3.3-70b-versatile',
  CEREBRAS_LLAMA_3_1_70B = 'llama3.1-70b',
  HF_MISTRAL_7B = 'mistralai/Mistral-7B-Instruct-v0.3',
  HF_LLAMA_3_8B = 'meta-llama/Meta-Llama-3-8B-Instruct'
}

export interface MessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GroundingLink {
  uri: string;
  title: string;
  type: 'web' | 'maps';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
  modelId?: ModelId;
  provider?: 'google' | 'groq' | 'cerebras' | 'huggingface';
  timestamp: number;
  isStreaming?: boolean;
  groundingLinks?: GroundingLink[];
  imageUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastModelId: ModelId;
}
