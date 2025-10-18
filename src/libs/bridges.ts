import { safeInvoke, isTauriRuntime, TauriUnavailableError } from "./tauri";

export async function inputText(text: string) {
    if (!isTauriRuntime()) {
        throw new TauriUnavailableError("input_text");
    }
    return await safeInvoke("input_text", { text });
}

export async function simulatePaste(){
    if (!isTauriRuntime()) {
        throw new TauriUnavailableError("simulate_paste");
    }
    return await safeInvoke("simulate_paste");
}

export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

export function getStoreKey(key: string, fallback: JsonValue): Promise<JsonValue> {
    if (!isTauriRuntime()) {
        try {
            if (typeof window !== "undefined") {
                const stash = window.localStorage.getItem("vibeclip.store");
                if (stash) {
                    const parsed = JSON.parse(stash);
                    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
                        return Promise.resolve(parsed[key]);
                    }
                }
            }
        } catch (error) {
            console.warn("无法读取本地存储", error);
        }
        return Promise.resolve(fallback ?? null);
    }
    return safeInvoke("get_key_from_store", { key, fallback });
}

export function setStoreKey(key: string, value: JsonValue): Promise<void> {
    if (!isTauriRuntime()) {
        try {
            if (typeof window !== "undefined") {
                const stash = window.localStorage.getItem("vibeclip.store") ?? "{}";
                const parsed = JSON.parse(stash);
                if (value === null) {
                    delete parsed[key];
                } else {
                    parsed[key] = value;
                }
                window.localStorage.setItem("vibeclip.store", JSON.stringify(parsed));
            }
        } catch (error) {
            console.warn("无法写入本地存储", error);
        }
        return Promise.resolve();
    }
    return safeInvoke("set_key_to_store", { key, value });
}
