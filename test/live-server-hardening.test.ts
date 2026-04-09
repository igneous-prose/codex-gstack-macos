import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_JSON_BODY_BYTES, startBrowserServer } from "../src/browser/server.js";

describe("live browser server hardening", () => {
  const servers: { close: (callback: (error?: Error | null) => void) => void }[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          })
      )
    );
    servers.length = 0;
  });

  async function startTestServer() {
    const handlers = {
      screenshot: vi.fn(async () => ({ outputPath: "/tmp/out.png" })),
      snapshot: vi.fn(async () => ({ outputPath: "/tmp/out.html" })),
      listCookieDomains: vi.fn(() => ["example.com"]),
      importCookies: vi.fn(async () => ({ importedCount: 1 }))
    };

    const serverInfo = await startBrowserServer({
      port: 0,
      token: "secret-token",
      handlers
    });
    servers.push(serverInfo.server);

    return {
      handlers,
      baseUrl: `http://${serverInfo.host}:${serverInfo.port}`
    };
  }

  it("keeps health unauthenticated", async () => {
    const { baseUrl } = await startTestServer();

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      host: "127.0.0.1"
    });
  });

  it("rejects unauthenticated malformed JSON before parsing", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/page/screenshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Missing Authorization header." });
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("rejects invalid auth tokens before parsing malformed JSON", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/page/screenshot`, {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-token",
        "content-type": "application/json"
      },
      body: "{"
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid auth token." });
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("returns 400 for authenticated malformed JSON", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/page/screenshot`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      body: "{"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Malformed JSON body." });
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("returns 413 for authenticated oversized JSON", async () => {
    const { baseUrl, handlers } = await startTestServer();
    const oversizedBody = JSON.stringify({ payload: "a".repeat(MAX_JSON_BODY_BYTES) });

    const response = await fetch(`${baseUrl}/page/screenshot`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      body: oversizedBody
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: `JSON body exceeds ${MAX_JSON_BODY_BYTES} bytes.`
    });
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("routes authenticated valid JSON to the handler", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/page/screenshot`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: "https://example.com",
        outputPath: "/tmp/out.png",
        allowLocalhost: false
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outputPath: "/tmp/out.png" });
    expect(handlers.screenshot).toHaveBeenCalledOnce();
  });

  it("returns 400 for authenticated invalid page payloads", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/page/screenshot`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: "https://example.com",
        outputPath: "/tmp/out.png",
        allowLocalhost: "true"
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "allowLocalhost must be a boolean." });
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("returns 400 for unsupported cookie browser queries", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/cookies/domains?browser=safari`, {
      method: "GET",
      headers: {
        authorization: "Bearer secret-token"
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "browser must be one of: brave, chrome, chromium, edge."
    });
    expect(handlers.listCookieDomains).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid cookie import payloads", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/cookies/import`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        browser: "chrome",
        domains: [1, "example.com"]
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "domains must be an array of strings."
    });
    expect(handlers.importCookies).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown post routes without parsing the body", async () => {
    const { baseUrl, handlers } = await startTestServer();

    const response = await fetch(`${baseUrl}/unknown`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      body: "{"
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found." });
    expect(handlers.screenshot).not.toHaveBeenCalled();
    expect(handlers.snapshot).not.toHaveBeenCalled();
    expect(handlers.importCookies).not.toHaveBeenCalled();
  });
});
