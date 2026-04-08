import { describe, expect, it, vi } from "vitest";

import { dispatchBrowserRequest } from "../src/browser/server.js";

describe("browser server auth", () => {
  it("allows unauthenticated health checks and rejects missing auth on command routes", async () => {
    const handlers = {
      screenshot: vi.fn(async () => ({ outputPath: "/tmp/out.png" })),
      snapshot: vi.fn(async () => ({ outputPath: "/tmp/out.html" })),
      listCookieDomains: vi.fn(() => ["example.com"]),
      importCookies: vi.fn(async () => ({ importedCount: 1 }))
    };

    const healthResponse = await dispatchBrowserRequest(
      {
        method: "GET",
        path: "/health"
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );
    expect(healthResponse.statusCode).toBe(200);

    const screenshotResponse = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        body: JSON.stringify({ url: "https://example.com", outputPath: "/tmp/out.png" })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );
    expect(screenshotResponse.statusCode).toBe(401);
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("rejects invalid auth tokens", async () => {
    const response = await dispatchBrowserRequest(
      {
        method: "GET",
        path: "/cookies/domains?browser=chrome",
        headers: { authorization: "Bearer wrong-token" }
      },
      {
        port: 0,
        token: "secret-token",
        handlers: {
          screenshot: async () => ({ outputPath: "/tmp/out.png" }),
          snapshot: async () => ({ outputPath: "/tmp/out.html" }),
          listCookieDomains: () => ["example.com"],
          importCookies: async () => ({ importedCount: 1 })
        }
      }
    );
    expect(response.statusCode).toBe(403);
  });
});
