// utils/pushNotifications.ts
//
// Push obavijesti (Expo Push). Poslužitelj sprema token uređaja i šalje
// obavijest kad netko objavi aktivnost iz kategorije koja korisnika zanima
// (vidi CroMap: NotificationController /push-token, ExpoPushService).
//
// Sve je "najbolji pokušaj": push je dodatak obavijestima u aplikaciji, pa
// odbijena dozvola, emulator ili nedostupna mreža nikad ne smiju smetati
// korisniku — greške se gutaju, a u razvoju ispisuju.

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { API_BASE_URL } from "../app/config/api";
import { getToken } from "./tokenStore";

const ENDPOINT = `${API_BASE_URL}/api/notification/push-token`;
const STORED_TOKEN_KEY = "expoPushToken";

const plog = (...args: unknown[]) => {
  if (__DEV__) console.log("[push]", ...args);
};

/**
 * Kad je aplikacija otvorena, obavijest se i dalje prikazuje kao traka —
 * inače je korisnik ne bi ni vidio dok ne otvori zvonce.
 */
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  // Isti id kao "channelId" koji šalje poslužitelj (ExpoPushService).
  await Notifications.setNotificationChannelAsync("default", {
    name: "Obavijesti",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Traži dozvolu ako treba i vraća Expo push token, ili null kad ga nema
 * (dozvola odbijena, emulator, nema projectId-a).
 */
async function getDevicePushToken(): Promise<string | null> {
  await ensureAndroidChannel();

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") {
    plog("permission not granted");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    plog("no EAS projectId");
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data || null;
}

async function call(method: "POST" | "DELETE", token: string) {
  const auth = await getToken();
  if (!auth) return false;
  const url =
    method === "DELETE"
      ? `${ENDPOINT}?token=${encodeURIComponent(token)}`
      : ENDPOINT;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth}`,
    },
    body:
      method === "POST"
        ? JSON.stringify({ token, platform: Platform.OS })
        : undefined,
  });
  return res.ok;
}

/**
 * Prijavi ovaj uređaj poslužitelju za push obavijesti. Sigurno je pozivati
 * više puta (poslužitelj radi upsert) — npr. pri svakom ulasku u aplikaciju,
 * jer token zna promijeniti vlasnika kad se na istom uređaju prijavi drugi
 * račun.
 *
 * @param enabled false = korisnik je isključio obavijesti u postavkama;
 *   tada se ne traži dozvola, a već prijavljeni token se skida.
 */
export async function registerForPush(enabled = true): Promise<void> {
  try {
    if (!enabled) {
      await unregisterPush();
      return;
    }
    const token = await getDevicePushToken();
    if (!token) return;
    const ok = await call("POST", token);
    plog("register", ok ? "ok" : "failed");
    if (ok) await AsyncStorage.setItem(STORED_TOKEN_KEY, token);
  } catch (e) {
    plog("register error", String(e));
  }
}

/**
 * Skini ovaj uređaj s računa. Zvati PRIJE brisanja prijave (treba token za
 * autorizaciju) — inače bi odjavljenom korisniku obavijesti i dalje stizale.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORED_TOKEN_KEY);
    if (!stored) return;
    await call("DELETE", stored);
    await AsyncStorage.removeItem(STORED_TOKEN_KEY);
    plog("unregistered");
  } catch (e) {
    plog("unregister error", String(e));
  }
}
