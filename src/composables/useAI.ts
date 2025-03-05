import { ref, type Ref } from 'vue';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { type CoreMessage, streamText, experimental_generateImage as generateImage, NoImageGeneratedError, tool, type Tool } from 'ai';
import type { Config } from './useConfig';
import { z } from 'zod';
import { tavily, type TavilyClient } from '@tavily/core';
import { fetch } from '@tauri-apps/plugin-http';

declare global {
    interface Window {
        fetchCORS: typeof fetch;
        fetchNative: typeof fetch;
    }
}

export class StopToken {
    _stop = false;
    _fns: (() => void)[] = [];
    stop() {
        if (this._stop) return;
        this._stop = true;
        for (const fn of this._fns) {
            fn();
        }
    }
    isStopped() {
        return this._stop;
    }
    onStop(fn: () => void) {
        this._fns.push(fn);
    }
}

export function useAIImage(config: Ref<Config>) {
    const status = ref<"ready" | "generating" | "error">("ready");
    const imageBase64 = ref<string>(""); // base64 image
    const errors = ref<string>("");
    const abortSignal = ref<AbortController | null>();

    const stop = () => {
        if (abortSignal.value) {
            abortSignal.value.abort();
        }
    }

    const getAIInstance = () => {
        return createOpenAICompatible({
            name: "OpenAICompatiable",
            apiKey: config.value.ai.imageApiKey,
            baseURL: config.value.ai.imageAIEndpoint,
        });
    };

    const generateAIImage = async (
        prompt: string,
        extras?: { [key: string]: string | number | boolean },
    ) => {
        status.value = "generating";
        abortSignal.value = new AbortController();
        try {
            const ai = getAIInstance();
            const model = ai?.imageModel?.(config.value.ai.imageModel);
            if (!model) {
                console.error("No image model found", {
                    model: config.value.ai.imageModel,
                    endpoint: config.value.ai.imageAIEndpoint,
                    apiKey: config.value.ai.imageApiKey,
                });
                throw new Error("No image model found");
            }

            const result = await generateImage({
                model,
                prompt,
                ...extras,
                abortSignal: abortSignal.value.signal,
            });

            status.value = "ready";
            imageBase64.value = result.image.base64;

            return result.image.base64;
        } catch (e) {
            console.error(e);
            if (NoImageGeneratedError.isInstance(e)) {
                errors.value = (e.cause as string) ?? "No image generated";
            } else {
                errors.value = "Failed to generate image";
            }
            status.value = "error";
            return null;
        }
    };

    const createImageTool = () => {
        return tool({
            description: 'Accept for prompts and generate image',
            parameters: z.object({
                prompt: z.string().describe('Prompt for generating image, need to be English and to be detailed, return in base64 format that you can concat to data uri and use it in markdown syntax.'),
            }),
            execute: async ({ prompt }) => {
                const result = await generateAIImage(prompt);
                if (result) return { ok: true, imageBase64: result };
                return { ok: false, error: errors.value };
            }
        });
    }

    return {
        status,
        generatedContent: imageBase64,
        errors,
        stop,
        generateAIImage,
        createImageTool,
    }
}

export function useAIWebSearch(config: Ref<Config>) {
    const searching = ref(false);

    const instance = ref<TavilyClient>(tavily({ apiKey: config.value.ai.tavilyApiKey }));

    const search = async (query: string) => {
        searching.value = true;
        try {
            return await instance.value.search(query, {});
        } catch (e) {
            return null;
        } finally {
            searching.value = false;
        }
    };

    const webSearchTool = () => tool({
        description: 'Search the web',
        parameters: z.object({
            query: z.string().describe('The query to search the web for'),
        }),
        execute: async ({ query }) => {
            const result = await search(query);
            if (result) return { ok: true, result };
            return { ok: false, error: 'Failed to search' };
        }
    });
    return {
        searching,
        search,
        webSearchTool,
    }
}

export function useAIWebCrawler(config: Ref<Config>) {
    const crawling = ref(false);

    const fetchWebPage = async (url: string) => {
        crawling.value = true;
        const endpoint = 'https://r.jina.ai';
        const apiKey = config.value.ai.jinaApiKey || '';
        const payload = {
            url,
            injectPageScript: [
                "// Remove headers, footers, navigation elements\ndocument.querySelectorAll('header, footer, nav').forEach(el => el.remove());\n\n// Or a url that returns a valid JavaScript code snippet\n// https://example.com/script.js"
            ]
        }
        const options: RequestInit & { headers: { [key: string]: string } } = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Base': 'final'
            },
            body: JSON.stringify(payload)
        }
        if (apiKey) {
            options.headers.Authorization = `Bearer ${apiKey}`;
        }
        try {
            return fetch(endpoint, options)
                .then(res => res.text())
        } catch (e) {
            return null;
        } finally {
            crawling.value = false;
        }
    }

    const webCrawlTool = () => tool({
        description: 'Crawl the web',
        parameters: z.object({
            url: z.string().describe('The URL to crawl'),
        }),
        execute: async ({ url }) => {
            const result = await fetchWebPage(url);
            if (result) return { ok: true, result };
            return { ok: false, error: 'Failed to crawl' };
        }
    });

    return {
        crawling,
        fetchWebPage,
        webCrawlTool,
    }
}

export function useAI(config: Ref<Config>) {
    const generating = ref(false);
    const generatedContent = ref<string>('');
    const userPrompt = ref<string>('');

    const getAIInstance = () => {
        return createOpenAICompatible({
            name: 'OpenAICompatiable',
            apiKey: config.value.ai.apiKey,
            baseURL: config.value.ai.endpoint,
            fetch: (...args) => {
                return config.value.ai.corsCompatiable
                ? window.fetchCORS(...args)
                : window.fetchNative(...args)
            }
        });
    };

    const getTools = () => {
        const tools: { [key: string]: Tool } = {};
        if (config.value.ai.enableWebCrawl) {
            const { webCrawlTool } = useAIWebCrawler(config);
            tools.webCrawler = webCrawlTool();
        }
        if (config.value.ai.enableWebsearch) {
            const { webSearchTool } = useAIWebSearch(config);
            tools.webSearch = webSearchTool();
        }
        const { getCurrentDateTime } = useAITools();
        tools.getCurrentDateTime = getCurrentDateTime();
        return tools;
    }

    const generateText = async (system: string, prompt: string, stopToken?: StopToken) => {
        generating.value = true;
        generatedContent.value = '';
        try {
            const ai = getAIInstance();
            const result = await streamText({
                model: ai.chatModel(config.value.ai.model),
                system,
                prompt,
                tools: config.value.ai.disableTools ? undefined : getTools(),
                maxSteps: 5,
            });
            let stop = false;
            stopToken?.onStop(() => {
                stop = true;
                result.consumeStream();
            });
            for await (const textPart of result.textStream) {
                generatedContent.value += textPart;
                if (stopToken?.isStopped() || stop) {
                    break;
                }
            }
        } catch (e) {
            // biome-ignore lint/complexity/noUselessCatch: <explanation>
            throw e;
        } finally {
            generating.value = false;
        }
    };

    return {
        generating,
        generatedContent,
        userPrompt,
        generateText,
    };
}

export function useAIChat(config: Ref<Config>) {
    const generating = ref(false);
    const messages = ref<CoreMessage[]>([]);
    const stopToken = new StopToken;

    const stop = () => {
        stopToken.stop();
    }

    const getAIInstance = () => {
        return createOpenAICompatible({
            name: 'OpenAICompatiable',
            apiKey: config.value.ai.apiKey,
            baseURL: config.value.ai.endpoint,
            fetch: (...args) => {
                return config.value.ai.corsCompatiable
                ? window.fetchCORS(...args)
                : window.fetchNative(...args)
            }
        });
    };

    const appendToMessages = (message: string, role: 'user' | 'assistant' | 'system' = 'user') => {
        messages.value.push({
            role: role,
            content: message,
        });
    }

    const fetchAIResponse = async (onChunk?: (textPart: string) => void, tools?: { [key: string]: Tool }) => {
        generating.value = true;
        if (stopToken) {
            stopToken._stop = false;
            stopToken._fns = [];
        }
        try {
            const ai = getAIInstance();
            const result = await streamText({
                model: ai.chatModel(config.value.ai.model),
                messages: messages.value,
                tools, maxSteps: 5,
            });
            let stop = false;
            stopToken?.onStop(() => {
                stop = true;
                result.consumeStream();
            });
            messages.value.push({
                role: 'assistant',
                content: '',
            })
            for await (const textPart of result.textStream) {
                messages.value[messages.value.length - 1].content += textPart;
                onChunk?.(textPart);
                if (stopToken?.isStopped() || stop) {
                    break;
                }
            }
        } finally {
            generating.value = false;
        }
    }

    return {
        generating,
        messages,
        appendToMessages,
        fetchAIResponse,
        stop,
    };
}

export function useAITools() {
    const getCurrentDateTime = () => tool({
        description: 'Get current date and time',
        parameters: z.object({}), // no parameters
        execute: async () => {
            const now = new Date();
            // YYYY-MM-DD HH:MM:SS, week day, timezone, Lunar date
            const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}, ${now.getDay()}, ${now.getTimezoneOffset()}, ${now.toLocaleDateString('zh-CN', { era: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
            return { date: dateStr };
        }
    });

    return {
        getCurrentDateTime,
    }
}
