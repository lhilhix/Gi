
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ModelId, MessagePart, GroundingLink } from "../types";

export interface ProviderKeys {
  groq?: string;
  cerebras?: string;
  huggingface?: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
}

export class AIService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  private refreshGoogleAI() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async sendMessageStream(
    modelId: ModelId,
    history: { role: 'user' | 'model'; parts: MessagePart[] }[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: any) => void,
    options?: { 
      useSearch?: boolean, 
      useMaps?: boolean, 
      location?: LocationData, 
      keys?: ProviderKeys,
      provider?: string 
    }
  ) {
    const provider = options?.provider;

    if (provider === 'google' || modelId.startsWith('gemini-')) {
      this.refreshGoogleAI();
      return this.sendGeminiMessage(modelId, history, prompt, onChunk, onComplete, options);
    } else if (provider === 'huggingface' || modelId.includes('/') ) {
      return this.sendHuggingFaceMessage(modelId, history, prompt, onChunk, onComplete, options?.keys);
    } else if (provider === 'groq' || provider === 'cerebras') {
      return this.sendOpenAIMessage(modelId, history, prompt, onChunk, onComplete, options?.keys, provider);
    } else {
      // Fallback for unexpected cases
      throw new Error(`Unknown provider for model: ${modelId}`);
    }
  }

  private async sendGeminiMessage(
    modelId: ModelId,
    history: any[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: GenerateContentResponse) => void,
    options?: { useSearch?: boolean, useMaps?: boolean, location?: LocationData }
  ) {
    try {
      const config: any = {};
      const tools: any[] = [];
      
      if (options?.useSearch) {
        tools.push({ googleSearch: {} });
      }
      
      if (options?.useMaps) {
        tools.push({ googleMaps: {} });
        if (options.location) {
          config.toolConfig = {
            retrievalConfig: {
              latLng: {
                latitude: options.location.latitude,
                longitude: options.location.longitude
              }
            }
          };
        }
      }

      if (tools.length > 0) {
        config.tools = tools;
      }

      const responseStream = await this.ai.models.generateContentStream({
        model: modelId,
        contents: [
          ...history.map(h => ({ role: h.role, parts: h.parts.map((p: any) => {
             if (p.text) return { text: p.text };
             if (p.inlineData) return { inlineData: p.inlineData };
             return { text: '' };
          }) })),
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config
      });

      let lastResponse: GenerateContentResponse | null = null;
      for await (const chunk of responseStream) {
        const textChunk = chunk.text || '';
        onChunk(textChunk);
        lastResponse = chunk as GenerateContentResponse;
      }

      if (lastResponse) onComplete(lastResponse);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      if (error?.message?.includes("Requested entity was not found")) {
        throw new Error("API_KEY_NOT_FOUND");
      }
      throw error;
    }
  }

  private async sendHuggingFaceMessage(
    modelId: ModelId,
    history: any[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: any) => void,
    keys?: ProviderKeys
  ) {
    const apiKey = keys?.huggingface;
    if (!apiKey) throw new Error("MISSING_PROVIDER_KEY");

    const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { return_full_text: false, max_new_tokens: 1024 },
          stream: false 
        })
      });

      if (!response.ok) {
         const errText = await response.text();
         console.error("HF API Error Text:", errText);
         throw new Error(`HF Error: ${response.status}`);
      }

      const result = await response.json();
      const text = Array.isArray(result) ? result[0]?.generated_text : result.generated_text;
      
      if (text) {
        onChunk(text);
        onComplete({ text });
      }
    } catch (error) {
      console.error("HF Inference Error:", error);
      throw error;
    }
  }

  private async sendOpenAIMessage(
    modelId: ModelId,
    history: any[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: any) => void,
    keys?: ProviderKeys,
    provider?: string
  ) {
    const isGroq = provider === 'groq';
    const endpoint = isGroq 
      ? "https://api.groq.com/openai/v1/chat/completions" 
      : "https://api.cerebras.ai/v1/chat/completions";
    
    const apiKey = isGroq ? keys?.groq : keys?.cerebras;

    if (!apiKey) {
      throw new Error("MISSING_PROVIDER_KEY");
    }

    try {
      const messages = [
        ...history.map(h => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.parts[0]?.text || ''
        })),
        { role: 'user', content: prompt }
      ];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("OpenAI-Compatible Error Detail:", errorData);
        if (response.status === 403) throw new Error("CORS_OR_FORBIDDEN");
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }

      onComplete({ text: fullContent });
    } catch (error: any) {
      console.error("Inference Error:", error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<{ imageUrl: string; description: string }> {
    try {
      this.refreshGoogleAI();
      const response = await this.ai.models.generateContent({
        model: ModelId.GEMINI_IMAGE,
        contents: [{ parts: [{ text: prompt }] }],
      });

      let imageUrl = '';
      let description = '';

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          description = part.text;
        }
      }

      return { imageUrl, description };
    } catch (error) {
      console.error("Gemini Image Gen Error:", error);
      throw error;
    }
  }

  extractGroundingLinks(response: any): GroundingLink[] {
    const links: GroundingLink[] = [];
    if (!response.candidates) return links;
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const chunks = groundingMetadata?.groundingChunks;
    
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          links.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri,
            type: 'web'
          });
        } else if (chunk.maps) {
          links.push({
            uri: chunk.maps.uri,
            title: chunk.maps.title || "View on Google Maps",
            type: 'maps'
          });
        }
      });
    }
    return links;
  }
}

export const geminiService = new AIService();
