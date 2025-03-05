import { getStoreKey, type JsonValue, setStoreKey } from "./bridges";

/**
 * StoreBackend used to move the store impl to different backend without changing usages
 */
export class Store {
    static async load(_ignored: string): Promise<Store> {
        return new Store();
    }

    close() { }

    save() { }

    getRaw(key:string, fallback: JsonValue = null): Promise<JsonValue> {
        return getStoreKey(key, fallback);
    }

    get<T>(key: string, fallback: JsonValue = null): Promise<T> {
        return this.getRaw(key, fallback) as Promise<T>;
    }

    set(key: string, value: JsonValue = null): Promise<void> {
        return setStoreKey(key, value);
    }

    has(key: string):Promise<boolean> {
        return getStoreKey(key, null).then(v => v !== null);
    }

    async delete(key: string): Promise<void> {
        if(await this.has(key)) {
            return setStoreKey(key, null);
        }
    }
}