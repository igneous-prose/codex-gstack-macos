import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { DEFAULT_HOST } from "./config.js";
import { type SupportedCookieBrowser } from "./config.js";

interface PageCommandPayload {
  readonly url: string;
  readonly outputPath: string;
  readonly allowLocalhost?: boolean;
}

interface CookieImportPayload {
  readonly browser: SupportedCookieBrowser;
  readonly domains: string[];
}

export interface BrowserServerHandlers {
  readonly screenshot: (payload: PageCommandPayload) => Promise<{ outputPath: string }>;
  readonly snapshot: (payload: PageCommandPayload) => Promise<{ outputPath: string }>;
  readonly listCookieDomains: (browser: SupportedCookieBrowser) => string[];
  readonly importCookies: (
    payload: CookieImportPayload
  ) => Promise<{ importedCount: number }>;
}

export interface BrowserServerOptions {
  readonly host?: string;
  readonly port: number;
  readonly token: string;
  readonly handlers: BrowserServerHandlers;
}

export interface DispatchRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string;
}

export interface DispatchResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

export const MAX_JSON_BODY_BYTES = 64 * 1024;

type ClassifiedRoute =
  | {
      readonly kind: "health";
      readonly requiresAuth: false;
      readonly requiresJsonBody: false;
    }
  | {
      readonly kind: "page-screenshot" | "page-snapshot" | "cookies-import";
      readonly requiresAuth: true;
      readonly requiresJsonBody: true;
    }
  | {
      readonly kind: "cookies-domains";
      readonly requiresAuth: true;
      readonly requiresJsonBody: false;
      readonly browser: string | null;
    }
  | {
      readonly kind: "not-found";
      readonly requiresAuth: false;
      readonly requiresJsonBody: false;
    };

class HttpBodyError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpBodyError";
  }
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function classifyRoute(
  method: string,
  path: string,
  host: string,
  port: number
): ClassifiedRoute {
  const requestUrl = new URL(path, `http://${host}:${port}`);

  if (requestUrl.pathname === "/health" && method === "GET") {
    return {
      kind: "health",
      requiresAuth: false,
      requiresJsonBody: false
    };
  }

  if (requestUrl.pathname === "/page/screenshot" && method === "POST") {
    return {
      kind: "page-screenshot",
      requiresAuth: true,
      requiresJsonBody: true
    };
  }

  if (requestUrl.pathname === "/page/snapshot" && method === "POST") {
    return {
      kind: "page-snapshot",
      requiresAuth: true,
      requiresJsonBody: true
    };
  }

  if (requestUrl.pathname === "/cookies/domains" && method === "GET") {
    return {
      kind: "cookies-domains",
      requiresAuth: true,
      requiresJsonBody: false,
      browser: requestUrl.searchParams.get("browser")
    };
  }

  if (requestUrl.pathname === "/cookies/import" && method === "POST") {
    return {
      kind: "cookies-import",
      requiresAuth: true,
      requiresJsonBody: true
    };
  }

  return {
    kind: "not-found",
    requiresAuth: false,
    requiresJsonBody: false
  };
}

function parseJsonBody<T>(rawBody: string | undefined): T {
  try {
    return JSON.parse(rawBody ?? "{}") as T;
  } catch {
    throw new HttpBodyError(400, "Malformed JSON body.");
  }
}

async function readJsonWithLimit<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bufferChunk = Buffer.from(chunk);
    totalBytes += bufferChunk.byteLength;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new HttpBodyError(413, `JSON body exceeds ${MAX_JSON_BODY_BYTES} bytes.`);
    }
    chunks.push(bufferChunk);
  }
  return parseJsonBody<T>(Buffer.concat(chunks).toString("utf8"));
}

async function dispatchAuthenticatedRoute(
  route: Exclude<ClassifiedRoute, { kind: "health" | "not-found" }>,
  parsedBody: unknown,
  handlers: BrowserServerHandlers
): Promise<DispatchResponse> {
  if (route.kind === "page-screenshot") {
    return {
      statusCode: 200,
      body: await handlers.screenshot(parsedBody as PageCommandPayload)
    };
  }

  if (route.kind === "page-snapshot") {
    return {
      statusCode: 200,
      body: await handlers.snapshot(parsedBody as PageCommandPayload)
    };
  }

  if (route.kind === "cookies-domains") {
    if (!route.browser) {
      return { statusCode: 400, body: { error: "browser query parameter is required." } };
    }
    return {
      statusCode: 200,
      body: { domains: handlers.listCookieDomains(route.browser as SupportedCookieBrowser) }
    };
  }

  return {
    statusCode: 200,
    body: await handlers.importCookies(parsedBody as CookieImportPayload)
  };
}

function authError(
  headers: Record<string, string | undefined> | undefined,
  token: string
): DispatchResponse | null {
  const headerValue = headers?.authorization;

  if (!headerValue) {
    return { statusCode: 401, body: { error: "Missing Authorization header." } };
  }

  if (headerValue !== `Bearer ${token}`) {
    return { statusCode: 403, body: { error: "Invalid auth token." } };
  }

  return null;
}

export async function dispatchBrowserRequest(
  request: DispatchRequest,
  options: BrowserServerOptions
): Promise<DispatchResponse> {
  const host = options.host ?? DEFAULT_HOST;
  const route = classifyRoute(request.method, request.path, host, options.port);

  if (route.kind === "health") {
    return { statusCode: 200, body: { ok: true, host } };
  }

  if (route.kind === "not-found") {
    return { statusCode: 404, body: { error: "Not found." } };
  }

  const authFailure = authError(request.headers, options.token);
  if (authFailure) {
    return authFailure;
  }

  const parsedBody = route.requiresJsonBody ? parseJsonBody(request.body) : undefined;
  return dispatchAuthenticatedRoute(route, parsedBody, options.handlers);
}

export async function startBrowserServer(options: BrowserServerOptions): Promise<{
  readonly server: Server;
  readonly host: string;
  readonly port: number;
}> {
  const host = options.host ?? DEFAULT_HOST;

  const server = createServer(async (request, response) => {
    try {
      const method = request.method?.toUpperCase() ?? "GET";
      const path = request.url ?? "/";
      const route = classifyRoute(method, path, host, options.port);

      if (route.kind === "health") {
        writeJson(response, 200, { ok: true, host });
        return;
      }

      if (route.kind === "not-found") {
        writeJson(response, 404, { error: "Not found." });
        return;
      }

      const authFailure = authError(
        {
          authorization: request.headers.authorization
        },
        options.token
      );
      if (authFailure) {
        writeJson(response, authFailure.statusCode, authFailure.body);
        return;
      }

      const parsedBody = route.requiresJsonBody
        ? await readJsonWithLimit<unknown>(request)
        : undefined;
      const dispatchResponse = await dispatchAuthenticatedRoute(route, parsedBody, options.handlers);
      writeJson(response, dispatchResponse.statusCode, dispatchResponse.body);
    } catch (error) {
      if (error instanceof HttpBodyError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      writeJson(response, 500, { error: message });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to obtain daemon bind address.");
  }

  return { server, host, port: address.port };
}
