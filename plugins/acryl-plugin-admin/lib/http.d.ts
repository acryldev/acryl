/**
 * Strict loopback HTTP helpers for this plugin's private routes: same-origin checks on the socket, Host and
 * Origin, a bounded JSON body, and uniform JSON responses. Same behaviour as the checks behind Desktop's own
 * settings routes (`apps/acryl-desktop/src/settings/desktop-settings-route.ts`) and the workspace routes
 * (`plugins/acryl-workspace/src/http.ts`); a follow-up should extract one shared library for all three.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
export declare function finishJson(res: ServerResponse, statusCode: number, value: object, allow?: 'GET' | 'POST'): void;
export declare function error(message: string): {
    readonly error: string;
};
/**
 * Require the actual socket and Host to stay on the configured loopback origin.
 * A mutating request must carry the exact Origin. A read-only browser GET may
 * use the standard same-origin fetch metadata plus its same-origin referrer,
 * because browsers commonly omit Origin on same-origin GET requests.
 */
export declare function isSameOriginLoopbackRequest(req: IncomingMessage, expectedOrigin: string, mutating: boolean): boolean;
export declare function parsePostBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | typeof INVALID_BODY>;
export declare const INVALID_BODY: unique symbol;
