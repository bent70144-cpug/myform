import { describe, expect, it, vi } from "vitest";
import { fetchSession } from "../src/client";

describe("fetchSession (client entrypoint)", () => {
  it("forwards the cookie and returns the session on 200", async () => {
    const session = {
      user: { id: "u1", email: "a@b.c", emailVerified: true },
      workspace: { id: "w1", name: "Personal", role: "owner" },
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }));
    const result = await fetchSession({ baseUrl: "http://api.internal", cookie: "sid=abc", fetchImpl });
    expect(result).toEqual(session);
    expect(fetchImpl).toHaveBeenCalledWith("http://api.internal/v1/auth/session", {
      headers: { cookie: "sid=abc" },
      cache: "no-store",
    });
  });

  it("returns null for invalid sessions (401) without throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const result = await fetchSession({ baseUrl: "http://api.internal", cookie: "", fetchImpl });
    expect(result).toBeNull();
  });

  it("throws on unexpected statuses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(fetchSession({ baseUrl: "http://api.internal", cookie: "", fetchImpl })).rejects.toThrow(
      /unexpected status 500/,
    );
  });
});
