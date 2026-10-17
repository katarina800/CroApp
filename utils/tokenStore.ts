// utils/tokenStore.ts
//
// Gdje se čuva prijavni token.
//
// Dosad je token ležao u AsyncStorage-u, a to je običan neenkriptiran spremnik
// (na Androidu SQLite datoteka u mapi aplikacije): tko ima pristup uređaju ili
// njegovoj sigurnosnoj kopiji može ga pročitati i s njim se prijaviti kao
// korisnik. Ovdje token ide u expo-secure-store — Android Keystore / iOS
// Keychain — gdje ga čuva operacijski sustav.
//
// Ostale vrijednosti prijave (ime, id) nisu tajne i ostaju u AsyncStorage-u.
//
// Selidba: postojeći korisnici imaju token u AsyncStorage-u. Pri prvom čitanju
// se prebaci u SecureStore i obriše sa stare lokacije, pa nitko nije odjavljen.
//
// Ako SecureStore nije dostupan (web, rijedak kvar Keystorea), koristi se
// AsyncStorage kao rezerva — bolje slabije čuvana prijava nego nikakva.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// expo-secure-store je nativni modul. Ako se novi JS pokrene na staroj
// instalaciji (bez tog modula — npr. Metro na starom development buildu),
// obični import bi srušio cijelu aplikaciju pri pokretanju. Zato se učitava
// ovdje, u try/catch: bez modula token ostaje u AsyncStorage-u kao prije, a
// sigurno spremište počne raditi čim se instalira novi build.
type SecureStoreModule = typeof import("expo-secure-store");
let SecureStore: SecureStoreModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require("expo-secure-store") as SecureStoreModule;
} catch {
  SecureStore = null;
}

const KEY = "token";

/**
 * Token u memoriji: čita se na desecima mjesta, a svako čitanje iz Keystorea je
 * poziv prema nativnom kodu. undefined = još nije učitan, null = nema ga.
 */
let cached: string | null | undefined;

const secureAvailable = () => Platform.OS !== "web" && SecureStore !== null;

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;

  if (secureAvailable()) {
    try {
      const secure = await SecureStore!.getItemAsync(KEY);
      if (secure) {
        cached = secure;
        return secure;
      }
    } catch {
      // Keystore nedostupan — padamo na AsyncStorage ispod.
    }
  }

  let legacy: string | null = null;
  try {
    legacy = await AsyncStorage.getItem(KEY);
  } catch {
    legacy = null;
  }

  if (legacy && secureAvailable()) {
    try {
      await SecureStore!.setItemAsync(KEY, legacy);
      await AsyncStorage.removeItem(KEY);
    } catch {
      // Selidba nije uspjela; token ostaje gdje je i radi, pokušat ćemo opet.
    }
  }

  cached = legacy;
  return legacy;
}

export async function setToken(token: string): Promise<void> {
  cached = token;

  if (secureAvailable()) {
    try {
      await SecureStore!.setItemAsync(KEY, token);
      // Stara kopija ne smije ostati čitljiva.
      await AsyncStorage.removeItem(KEY).catch(() => {});
      return;
    } catch {
      // Padamo na AsyncStorage.
    }
  }
  await AsyncStorage.setItem(KEY, token);
}

export async function clearToken(): Promise<void> {
  cached = null;
  if (secureAvailable()) {
    try {
      await SecureStore!.deleteItemAsync(KEY);
    } catch {
      // Nastavi: stara lokacija se svejedno briše.
    }
  }
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/** Samo za testove: zaboravi token u memoriji. */
export function __resetTokenCacheForTests() {
  cached = undefined;
}
