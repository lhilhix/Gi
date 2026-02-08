
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ModelId, MessagePart, GroundingLink } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async sendMessageStream(
    modelId: ModelId,
    history: { role: 'user' | 'model'; parts: MessagePart[] }[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: GenerateContentResponse) => void,
    options?: { useSearch?: boolean }
  ) {
    try {
      // Configuration for search grounding
      const config: any = {};
      if (options?.useSearch && modelId !== ModelId.GEMINI_IMAGE) {
        config.tools = [{ googleSearch: {} }];
      }

      // We use GenerateContentStream directly for cleaner integration with multi-turn
      const responseStream = await this.ai.models.generateContentStream({
        model: modelId,
        contents: [
          ...history.map(h => ({ role: h.role, parts: h.parts.map(p => {
             if (p.text) return { text: p.text };
             if (p.inlineData) return { inlineData: p.inlineData };
             return { text: '' };
          }) })),
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config
      });

      let fullText = '';
      let lastResponse: GenerateContentResponse | null = null;

      for await (const chunk of responseStream) {
        const textChunk = chunk.text || '';
        fullText += textChunk;
        onChunk(textChunk);
        lastResponse = chunk as GenerateContentResponse;
      }

      if (lastResponse) {
        onComplete(lastResponse);
      }
    } catch (error) {
      console.error("Gemini Stream Error:", error);
      throw error;
    }
  }

  async generateImage(prompt: string): Promise<{ imageUrl: string; description: string }> {
    try {
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

  extractGroundingLinks(response: GenerateContentResponse): GroundingLink[] {
    const links: GroundingLink[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          links.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri
          });
        }
      });
    }
    return links;
  }
}

export const geminiService = new GeminiService();
