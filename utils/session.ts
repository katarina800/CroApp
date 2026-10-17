// utils/session.ts
//
// Je li prijava još valjana.
//
// Token vrijedi 7 dana i ne obnavlja se. Aplikacija je dosad provjeravala
// samo POSTOJI li token, nikad vrijedi li još — pa je sedmog dana korisnik
// ulazio u naizgled normalnu aplikaciju u kojoj svaki zahtjev vraća 401.
// Kako gotovo svaki ekran piše `if (res.ok) setX(...)` i `catch {}`, to se
// nije vidjelo kao greška nego kao prazno: nema pratitelja, nema poruka,
// nema videa, profilna slika pala na inicijale. Podaci su cijelo vrijeme
// bili u bazi.
//
// Rok isteka piše u samom tokenu, pa se provjerava bez ijednog mrežnog
// poziva — i prije nego se uđe u aplikaciju.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { setSentryUser } from "../app/config/sentry";
import { clearToken, getToken } from "./tokenStore";

/** Ključevi (osim tokena) koje prijava upisuje i koje odjava mora počistiti. */
const AUTH_KEYS = ["userId", "firstName", "lastName", "username"] as const;

/**
 * Sekunde do isteka iz "exp" tvrdnje tokena, ili null kad se ne da
 * pročitati. JWT je "header.payload.potpis", a payload je base64url JSON.
 */
function readExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    // base64url → base64, uz nadopunu na višekratnik od 4.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );

    const claims = JSON.parse(atob(padded));
    return typeof claims?.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * Je li token istekao.
 *
 * Token bez čitljivog roka se NE smatra isteklim: bolje pustiti poslužitelj
 * da presudi nego izbaciti korisnika zbog formata koji ovdje nismo predvidjeli.
 *
 * Minuta zalihe je namjerna — poslužitelj ne prašta ni sekundu
 * (ClockSkew = 0), pa token koji istječe za pola minute nema smisla slati.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;

  const exp = readExpiry(token);
  if (exp === null) return false;

  return exp * 1000 <= Date.now() + 60_000;
}

/** Token ako je još valjan, inače null. */
export async function getValidToken(): Promise<string | null> {
  try {
    const token = await getToken();
    return isTokenExpired(token) ? null : token;
  } catch {
    return null;
  }
}

/** Obriši prijavu. Ostalo (jezik, tema, spremljeni izbori) se ne dira. */
export async function clearSession(): Promise<void> {
  // Token je u SecureStore-u (vidi utils/tokenStore), ostalo u AsyncStorage-u.
  await clearToken();
  try {
    await AsyncStorage.multiRemove([...AUTH_KEYS]);
  } catch {}
  // Odjavljeni korisnik se više ne veže uz prijave padova — inače bi se
  // greške sljedeće osobe na istom uređaju pripisale njemu.
  try {
    setSentryUser(null);
  } catch {}
}
