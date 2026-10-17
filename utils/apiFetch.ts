// utils/apiFetch.ts
//
// Jedno mjesto za razgovor s poslužiteljem.
//
// Prije je u aplikaciji bilo 141 poziv fetch-a, svaki sa svojim (ili nikakvim)
// rukovanjem greškom. Posljedice: zahtjev bez odgovora visio je bez kraja
// (spori Render, loša mreža), istekla prijava se gutala kao "prazan ekran", a
// ista pogreška ("provjeri vezu" iako je poslužitelj odgovorio) pisala se
// različito na različitim ekranima.
//
// Što ovo radi:
//  • timeout — zahtjev se prekida nakon 20 s (120 s za slanje datoteka);
//  • jedinstvene greške — ApiError s vrstom "timeout" ili "network", umjesto
//    sirove iznimke koju svaki ekran tumači po svom;
//  • istekla prijava — kad poslužitelj za zahtjev s našim tokenom odgovori
//    401 uz "WWW-Authenticate: Bearer" (tako JWT middleware odbija token),
//    sesija se briše i korisnik vraća na prijavu. Običan 401 iz aplikacijske
//    logike (pogrešna lozinka) NE odjavljuje nikoga.
//
// Za nove pozive koristi apiFetch / apiJson. Postojeći pozivi dobivaju timeout
// i obradu istekle prijave bez izmjene preko installApiGuard() (poziva se u
// app/_layout.tsx).

import { getToken } from "./tokenStore";

export type ApiErrorKind = "timeout" | "network";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message?: string) {
    super(
      message ??
        (kind === "timeout" ? "Request timed out" : "Network request failed"),
    );
    this.name = "ApiError";
    this.kind = kind;
  }
}

export const DEFAULT_TIMEOUT_MS = 20_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

export interface ApiInit extends Omit<RequestInit, "body"> {
  /** Dodaj Authorization: Bearer <token> (zadano: da, ako token postoji). */
  auth?: boolean;
  /** Tijelo kao objekt — serijalizira se u JSON uz Content-Type. */
  json?: unknown;
  body?: RequestInit["body"];
  timeoutMs?: number;
}

type UnauthorizedHandler = () => void | Promise<void>;
let onUnauthorized: UnauthorizedHandler | null = null;
let lastUnauthorizedAt = 0;

/** Što napraviti kad je prijava istekla (odjava + prijavni ekran). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

// Izvorni fetch, zapamćen PRIJE nego ga installApiGuard zamijeni — inače bi
// apiFetch zvao vlastiti omot i petljao.
const rawFetch: typeof fetch = (...args) =>
  globalThis.__rawFetch
    ? globalThis.__rawFetch(...args)
    : globalThis.fetch(...args);

declare global {
  // eslint-disable-next-line no-var
  var __rawFetch: typeof fetch | undefined;
}

function headerValue(
  headers: HeadersInit | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (typeof Headers !== "undefined" && headers instanceof Headers)
    return headers.get(name);
  if (Array.isArray(headers)) {
    const hit = headers.find(([k]) => k.toLowerCase() === lower);
    return hit ? hit[1] : null;
  }
  for (const [k, v] of Object.entries(headers as Record<string, string>)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

async function handleExpiredSession(sentAuthorization: string) {
  // Zahtjev je mogao krenuti prije nove prijave; odgovor na staru prijavu
  // ne smije odjaviti novu.
  const current = await getToken();
  if (!current || `Bearer ${current}` !== sentAuthorization) return;

  // Više zahtjeva odjednom dobije 401; odjava se radi jednom.
  const now = Date.now();
  if (now - lastUnauthorizedAt < 3000) return;
  lastUnauthorizedAt = now;

  try {
    await onUnauthorized?.();
  } catch {}
}

/** Jezgra: timeout + vrste grešaka + obrada istekle prijave. */
export async function guardedFetch(
  doFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const outer = init?.signal;
  let timedOut = false;

  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort);
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await doFetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new ApiError("timeout");
    // Namjerni prekid pozivatelja (npr. novi upit zamjenjuje stari) se ne
    // pretvara u "mrežnu grešku" — pozivatelj ga očekuje kao AbortError.
    if (outer?.aborted) throw err;
    throw new ApiError(
      "network",
      err instanceof Error ? err.message : undefined,
    );
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }

  if (response.status === 401) {
    const sent = headerValue(init?.headers, "Authorization");
    const challenge = response.headers?.get?.("www-authenticate") ?? "";
    if (sent && /^bearer/i.test(challenge)) {
      void handleExpiredSession(sent);
    }
  }

  return response;
}

/**
 * fetch s tokenom, timeoutom i jedinstvenim greškama.
 * Baca ApiError ("timeout" | "network"); HTTP greške (4xx/5xx) vraća kao običan
 * Response — pozivatelj ih tumači (npr. 409 "zauzeto").
 */
export async function apiFetch(
  url: string,
  init: ApiInit = {},
): Promise<Response> {
  const { auth = true, json, timeoutMs, headers, body, ...rest } = init;

  const merged: Record<string, string> = {};
  if (headers) {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach((v, k) => (merged[k] = v));
    } else if (Array.isArray(headers)) {
      headers.forEach(([k, v]) => (merged[k] = v));
    } else {
      Object.assign(merged, headers as Record<string, string>);
    }
  }

  let finalBody = body;
  if (json !== undefined) {
    finalBody = JSON.stringify(json);
    if (!headerValue(merged, "Content-Type"))
      merged["Content-Type"] = "application/json";
  }

  if (auth && !headerValue(merged, "Authorization")) {
    const token = await getToken();
    if (token) merged["Authorization"] = `Bearer ${token}`;
  }

  const isUpload =
    typeof FormData !== "undefined" && finalBody instanceof FormData;
  const timeout =
    timeoutMs ?? (isUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  return guardedFetch(
    rawFetch,
    url,
    { ...rest, headers: merged, body: finalBody },
    timeout,
  );
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

/** apiFetch + sigurno čitanje JSON-a (prazno ili neispravno tijelo → null). */
export async function apiJson<T = unknown>(
  url: string,
  init: ApiInit = {},
): Promise<ApiResult<T>> {
  const res = await apiFetch(url, init);
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Omot oko globalnog fetch-a za pozive prema našem poslužitelju: svi postojeći
 * pozivi dobivaju timeout i obradu istekle prijave bez da se svaki prepisuje.
 * Tuđi pozivi (Overpass, Nominatim, Google, Sentry) ostaju netaknuti.
 */
export function installApiGuard(apiBaseUrl: string) {
  if (globalThis.__rawFetch) return; // već instalirano

  const original = globalThis.fetch.bind(globalThis);
  globalThis.__rawFetch = original;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (!url.startsWith(apiBaseUrl)) return original(input, init);

    const isUpload =
      typeof FormData !== "undefined" && init?.body instanceof FormData;
    return guardedFetch(
      original,
      input,
      init,
      isUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
    );
  }) as typeof fetch;
}

/**
 * Tekst za korisnika kad zahtjev nije ni stigao do odgovora: predugo čekanje
 * (timeout) ili nema veze. Jedna poruka za cijelu aplikaciju.
 */
export function describeNetworkError(
  err: unknown,
  t: (key: string) => string,
): string {
  return err instanceof ApiError && err.kind === "timeout"
    ? t("common.requestTimeout")
    : t("common.networkError");
}
