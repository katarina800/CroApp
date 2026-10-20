// apiFetch: timeout, vrste grešaka i obrada istekle prijave.

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { __resetTokenCacheForTests, setToken } from "../utils/tokenStore";
import {
  ApiError,
  apiFetch,
  apiJson,
  describeNetworkError,
  guardedFetch,
  setUnauthorizedHandler,
} from "../utils/apiFetch";

const mockResponse = (
  status: number,
  headers: Record<string, string> = {},
  body: unknown = {},
) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  }) as unknown as Response;

const flush = () => new Promise((r) => setImmediate(r));

let fetchMock: jest.Mock;

beforeEach(() => {
  __resetTokenCacheForTests();
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock;
  setUnauthorizedHandler(null);
});

describe("apiFetch", () => {
  it("dodaje Authorization kad token postoji", async () => {
    await setToken("tok");
    fetchMock.mockResolvedValue(mockResponse(200));

    await apiFetch("https://api.test/x");

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("ne dodaje Authorization uz auth:false (npr. prijava)", async () => {
    await setToken("tok");
    fetchMock.mockResolvedValue(mockResponse(200));

    await apiFetch("https://api.test/login", {
      auth: false,
      method: "POST",
      json: { a: 1 },
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });

  it("HTTP greške vraća kao Response, ne baca", async () => {
    fetchMock.mockResolvedValue(mockResponse(409));
    const res = await apiFetch("https://api.test/x", { auth: false });
    expect(res.status).toBe(409);
  });

  it("mrežni kvar postaje ApiError('network')", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(
      apiFetch("https://api.test/x", { auth: false }),
    ).rejects.toMatchObject({
      name: "ApiError",
      kind: "network",
    });
  });

  it("zahtjev bez odgovora se prekida i postaje ApiError('timeout')", async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      );

      const p = apiFetch("https://api.test/x", {
        auth: false,
        timeoutMs: 5000,
      });
      const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
      await jest.advanceTimersByTimeAsync(5001);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it("namjerni prekid pozivatelja nije mrežna greška", async () => {
    const abort = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () =>
            reject(new Error("AbortError")),
          );
        }),
    );
    const p = apiFetch("https://api.test/x", {
      auth: false,
      signal: abort.signal,
    });
    abort.abort();
    await expect(p).rejects.not.toBeInstanceOf(ApiError);
  });

  it("apiJson ne pada na praznom tijelu", async () => {
    fetchMock.mockResolvedValue({
      ...mockResponse(204),
      json: async () => {
        throw new Error("empty");
      },
    });
    const r = await apiJson("https://api.test/x", { auth: false });
    expect(r).toEqual({ ok: true, status: 204, data: null });
  });
});

describe("istekla prijava", () => {
  it("401 uz WWW-Authenticate: Bearer za naš token poziva handler", async () => {
    await setToken("tok");
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      mockResponse(401, { "www-authenticate": 'Bearer error="invalid_token"' }),
    );

    // novi modul-stanje (razmak od 3 s) — jedan poziv je dovoljan
    jest.isolateModules(() => {});
    await apiFetch("https://api.test/x");
    await flush();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("običan 401 iz aplikacijske logike (bez Bearer izazova) NE odjavljuje", async () => {
    await setToken("tok2");
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(mockResponse(401));

    await apiFetch("https://api.test/change-password", { method: "PUT" });
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it("401 na zahtjev bez tokena (pogrešna lozinka pri prijavi) NE odjavljuje", async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      mockResponse(401, { "www-authenticate": "Bearer" }),
    );

    await apiFetch("https://api.test/login", { auth: false, method: "POST" });
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it("odgovor na STARU prijavu ne odjavljuje novu", async () => {
    await setToken("stari");
    const handler = jest.fn();
    setUnauthorizedHandler(handler);

    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((r) => (resolve = r)),
    );
    const p = apiFetch("https://api.test/x"); // krene sa starim tokenom
    await flush();

    await setToken("novi"); // korisnik se u međuvremenu ponovno prijavio
    resolve(mockResponse(401, { "www-authenticate": "Bearer" }));
    await p;
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("guardedFetch", () => {
  it("prosljeđuje odgovor netaknut", async () => {
    const res = mockResponse(200);
    const raw = jest.fn().mockResolvedValue(res);
    await expect(guardedFetch(raw as any, "https://x", {}, 1000)).resolves.toBe(
      res,
    );
  });
});

describe("describeNetworkError", () => {
  const t = (k: string) => k;
  it("timeout i mreža imaju različite poruke", () => {
    expect(describeNetworkError(new ApiError("timeout"), t)).toBe(
      "common.requestTimeout",
    );
    expect(describeNetworkError(new ApiError("network"), t)).toBe(
      "common.networkError",
    );
    expect(describeNetworkError(new Error("x"), t)).toBe("common.networkError");
  });
});
