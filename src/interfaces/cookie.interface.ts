export interface CookieAccess {
    read(): string;
    write(line: string): void;
}

/**
 * Attributes applied when a cookie is written.
 * `expires` is a day count or a `Date`. `maxAge` is seconds and wins when both are set.
 * Omit both for a session cookie.
 */
export interface CookieOptions {
    expires?: number | Date;
    maxAge?: number;
    path?: string;
    domain?: string;
    secure?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    partitioned?: boolean;
}