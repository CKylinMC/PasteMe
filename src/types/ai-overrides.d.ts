declare module 'ai' {
  export type CoreMessage = any;
  export type Tool = any;
  export const streamText: any;
  export const experimental_generateImage: any;
  export const tool: (...args: any[]) => any;
  export class NoImageGeneratedError extends Error {
    static isInstance(error: unknown): boolean;
  }
}

declare module '@ai-sdk/openai-compatible' {
  export const createOpenAICompatible: any;
}

declare module '@tavily/core' {
  export const tavily: any;
  export type TavilyClient = any;
}
