import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { DEFAULT_HOST } from "./config.js";
import { type SupportedCookieBrowser } from "./config.js";

interface PageCommandPayload {
  readonly url: string;
  readonly outputPath: string;
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

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(rawBody) as T;
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
  const requestUrl = new URL(request.path, `http://${host}:${options.port}`);

  if (requestUrl.pathname === "/health" && request.method === "GET") {
    return { statusCode: 200, body: { ok: true, host } };
  }

  const authFailure = authError(request.headers, options.token);
  if (authFailure) {
    return authFailure;
  }

  if (requestUrl.pathname === "/page/screenshot" && request.method === "POST") {
    return {
      statusCode: 200,
      body: await options.handlers.screenshot(JSON.parse(request.body ?? "{}") as PageCommandPayload)
    };
  }

  if (requestUrl.pathname === "/page/snapshot" && request.method === "POST") {
    return {
      statusCode: 200,
      body: await options.handlers.snapshot(JSON.parse(request.body ?? "{}") as PageCommandPayload)
    };
  }

  if (requestUrl.pathname === "/cookies/domains" && request.method === "GET") {
    const browser = requestUrl.searchParams.get("browser");
    if (!browser) {
      return { statusCode: 400, body: { error: "browser query parameter is required." } };
    }
    return {
      statusCode: 200,
      body: { domains: options.handlers.listCookieDomains(browser as SupportedCookieBrowser) }
    };
  }

  if (requestUrl.pathname === "/cookies/import" && request.method === "POST") {
    return {
      statusCode: 200,
      body: await options.handlers.importCookies(JSON.parse(request.body ?? "{}") as CookieImportPayload)
    };
  }

  return { statusCode: 404, body: { error: "Not found." } };
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
      const body =
        method === "POST" || method === "PUT" || method === "PATCH"
          ? JSON.stringify(await readJson<unknown>(request))
          : undefined;
      const dispatchRequest: DispatchRequest = {
        method,
        path: request.url ?? "/",
        headers: {
          authorization: request.headers.authorization
        },
        ...(body !== undefined ? { body } : {})
      };
      const dispatchResponse = await dispatchBrowserRequest(
        dispatchRequest,
        options
      );
      writeJson(response, dispatchResponse.statusCode, dispatchResponse.body);
    } catch (error) {
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
