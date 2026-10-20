// utils/notificationsApi.ts
//
// Obavijesti o novim objavama korisnika koje pratite, filtrirane po
// kategorijama koje ste sami odabrali.
//
// Postavke se sada čuvaju NA POSLUŽITELJU, ne samo na uređaju: dok su živjele
// isključivo u AsyncStorageu, poslužitelj nije mogao znati koga koja
// kategorija zanima, pa obavijesti nije ni bilo kako slati. AsyncStorage
// ostaje kao brzi lokalni predložak da se ekran postavki odmah iscrta.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../app/config/api";
import { getToken } from "@/utils/tokenStore";
import { registerForPush } from "./pushNotifications";

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  category: string | null;
  videoId: number | null;
  actorUserId: number | null;
  actorName: string;
  actorAvatar: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  appEnabled: boolean;
  emailEnabled: boolean;
  email: string;
  /** Stabilne oznake kategorija ("club", "museum"…), ne prevedeni nazivi. */
  categories: string[];
  /**
   * Prima li korisnik i sadržaj izvan svojih krajeva. Uključeno je zadano
   * da aplikacija na početku ne izgleda prazno; tko ne želi svjetske
   * aktivnosti, isključi ovdje.
   */
  globalEnabled: boolean;
  /**
   * Dokle za ovog korisnika seže "blizu mene", u kilometrima. Ista brojka
   * vrijedi za feed i za obavijesti; poslužitelj je ograničava na 1–100.
   */
  radiusKm: number;
}

const BASE = `${API_BASE_URL}/api/notification`;

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

/**
 * Popis obavijesti, ili null kad ga nije bilo moguće dohvatiti.
 *
 * Razlika je bitna: prije se na svaku grešku vraćao prazan niz, pa je ekran
 * i kod srušenog upita na poslužitelju mirno pisao "Nema novih obavijesti".
 * Tako je nemoguće razlikovati "još nitko ništa nije objavio" od "ovo je
 * pokvareno" — a upravo je to razliku trebalo vidjeti dok se tražilo zašto
 * obavijesti ne stižu.
 */
export async function getNotifications(
  limit = 30,
  offset = 0,
): Promise<AppNotification[] | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${BASE}?limit=${limit}&offset=${offset}`, {
      headers,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}

/** Broj nepročitanih — koristi ga značka na zvonu. */
export async function getUnreadCount(): Promise<number> {
  const headers = await authHeaders();
  if (!headers) return 0;
  try {
    const res = await fetch(`${BASE}/unread-count`, { headers });
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data?.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: number): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${BASE}/${id}/read`, { method: "POST", headers });
    return res.ok;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${BASE}/read-all`, { method: "POST", headers });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteNotification(id: number): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${BASE}/preferences`, { headers });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      appEnabled: !!(d.appEnabled ?? d.AppEnabled),
      emailEnabled: !!(d.emailEnabled ?? d.EmailEnabled),
      email: d.email ?? d.Email ?? "",
      categories: Array.isArray(d.categories ?? d.Categories)
        ? (d.categories ?? d.Categories)
        : [],
      // Stariji poslužitelj ovo polje ne vraća — tada je uključeno.
      globalEnabled: (d.globalEnabled ?? d.GlobalEnabled) !== false,
      radiusKm: Number(d.radiusKm ?? d.RadiusKm) || 50,
    };
  } catch {
    return null;
  }
}

/**
 * Zašto spremanje nije uspjelo. Bez ovoga je ekran znao reći samo "provjerite
 * vezu", pa je korisnik s isteklom prijavom beskorisno provjeravao internet —
 * a trebao se samo ponovno prijaviti.
 */
export type SaveFailureReason =
  /** Nema tokena ili ga poslužitelj odbija (401/403) — prijava je istekla. */
  | "auth"
  /** Poslužitelj je odgovorio greškom (4xx/5xx). */
  | "server"
  /** Zahtjev uopće nije stigao do poslužitelja. */
  | "network";

export interface SavePreferencesResult {
  ok: boolean;
  reason?: SaveFailureReason;
  /** HTTP status kad ga ima — korisno u dojavi greške. */
  status?: number;
}

/**
 * Spremi postavke na poslužitelj.
 *
 * Vraća i razlog neuspjeha, da ekran može reći korisniku što zapravo učiniti —
 * tiho ignoriranje bi značilo da korisnik misli da je sve uključeno, a ništa
 * ne dolazi.
 */
export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<SavePreferencesResult> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: "auth" };
  try {
    const res = await fetch(`${BASE}/preferences`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        appEnabled: prefs.appEnabled,
        emailEnabled: prefs.emailEnabled,
        email: prefs.email || null,
        categories: prefs.categories,
        globalEnabled: prefs.globalEnabled,
        radiusKm: prefs.radiusKm,
      }),
    });

    if (res.ok) {
      // Uključene obavijesti = trenutak da se zatraži dozvola i prijavi uređaj;
      // isključene = uređaj se skida. Ne čeka se: spremanje je već uspjelo.
      void registerForPush(prefs.appEnabled);
      return { ok: true };
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, reason: "auth", status: res.status };
    return { ok: false, reason: "server", status: res.status };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Prijevodni ključ poruke koja korisniku kaže što učiniti. Isti tekst na svim
 * mjestima gdje se postavke spremaju — inače bi svaki ekran izmislio svoj.
 */
export function saveFailureMessageKey(reason?: SaveFailureReason): string {
  switch (reason) {
    case "auth":
      return "notif.saveFailedAuth";
    case "server":
      return "notif.saveFailedServer";
    default:
      return "notif.saveFailed";
  }
}

/**
 * Kod odgovora u zagradi, kad ga ima.
 *
 * "Poslužitelj je odbio zahtjev" ne razlikuje endpoint kojeg nema (404, kod
 * nije deployan) od srušenog upita (500, migracija nije pokrenuta) — a to su
 * dva posve različita popravka. Broj u poruci to kaže odmah, bez kopanja po
 * logovima.
 */
export function saveFailureDetail(result: SavePreferencesResult): string {
  return result.status ? ` (${result.status})` : "";
}

/** Objava na koju obavijest upućuje, onoliko koliko treba za prikaz detalja. */
export interface NotifiedPost {
  id: number;
  title: string;
  additionalDescription: string;
  location: string;
  filePath: string;
  mediaType?: string;
  thumbnailPath?: string | null;
  userId: number;
  userName?: string;
  userFirstName?: string;
  userLastName?: string;
  isEvent?: boolean;
  eventStartAt?: string | null;
  createdAt: string;
}

/**
 * Dohvati objavu iz obavijesti.
 *
 * Vraća null i kad je objava u međuvremenu obrisana — obavijest tada ostaje u
 * popisu, ali nema što otvoriti, pa se to i kaže umjesto praznog ekrana.
 */
export async function getNotifiedPost(
  videoId: number,
): Promise<NotifiedPost | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/video/${videoId}`, {
      headers,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
