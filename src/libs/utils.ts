// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function tryParse(str: string, fallback: any = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function asString(obj: any): string {
    return obj as unknown as string;
}

export function bytesToSize(bytes: number) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Number.parseFloat((bytes / 1024 ** i).toFixed(2))} ${sizes[i]}`;
}

export function fetchUrls(str: string) {
    if (!str || str.length > 1000 || str.length < 3) return [];

    const urlPattern = /https?:\/\/[^\s/$.?#].[^\s]*/gi;
    const commonSuffixes = [
        '.com', '.org', '.net', '.int', '.edu', '.gov', '.cn', '.uk', '.co',
        '.de', '.jp', '.fr', '.au', '.us', '.ru', '.it', '.nl', '.se', '.kr',
        '.no', '.es', '.ca', '.site', '.me', '.tech', '.io', '.info', '.top',
        '.ai', '.online', '.club', '.xyz', '.cc', '.tv', '.mobi', '.asia', '.gl',
        '.cat', '.vip', '.ms', '.pw', '.pro', '.sh', '.tw', '.hk', '.sg', '.in'
    ];

    // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
    const nonAsciiPattern = /[^\x00-\x7F]/;
    const nonChinesePattern = /[^\u4e00-\u9fa5]/;

    const isValidUrl = (url: string) => {
        return !nonAsciiPattern.test(url) || !nonChinesePattern.test(url);
    };
    const potentialUrls = str.split(/[\s\n]+/).filter(word => (urlPattern.test(word) || commonSuffixes.some(suffix => word.includes(suffix))) && isValidUrl(word));
    return potentialUrls.sort((a, b) => str.indexOf(a) - str.indexOf(b));
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function debounce<T extends (...args: any[]) => any>(fn: T, delay = 300) {
    let timer: number;
    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    } as T;
}

export function convertDatetime(utcDatetime: string) {
    const regex = /(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s+([+-]\d{2}):(\d{2}):(\d{2})/;
    const match = utcDatetime.match(regex);

    if (!match) {
        return "100年内";
    }

    const [, datePart, hours, minutes, seconds, milliseconds, tzHours, tzMinutes] = match;

    const isoDateString = `${datePart}T${hours.padStart(2, '0')}:${minutes}:${seconds}.${milliseconds}${tzHours}:${tzMinutes}`;

    const date = new Date(isoDateString);
    if (Number.isNaN(date.getTime())) {
        return "100年内";
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
        return "刚刚";
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟前`;
    }
    if (diffHours < 24) {
        return `${diffHours} 小时前`;
    }
    if (diffDays < 30) {
        return `${diffDays} 天前`;
    }
    if (diffMonths < 12) {
        return `${diffMonths} 个月前`;
    }
    return `${diffYears} 年前`;
}
