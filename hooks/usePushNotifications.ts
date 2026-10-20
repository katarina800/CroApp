// hooks/usePushNotifications.ts
//
// Zvati iz layouta koji živi samo dok je korisnik prijavljen ((tabs)/_layout):
//  - pri ulasku (i povratku iz pozadine) prijavljuje uređaj poslužitelju,
//  - dodir na obavijest otvara ekran Obavijesti (i kad je aplikacija bila
//    potpuno zatvorena).

import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { getNotificationPreferences } from "../utils/notificationsApi";
import {
  configureForegroundNotifications,
  registerForPush,
} from "../utils/pushNotifications";

configureForegroundNotifications();

export function usePushNotifications() {
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      // Korisnik koji je izričito isključio obavijesti ne dobiva ni upit za
      // dozvolu. Nepoznato stanje (mreža) tretira se kao uključeno.
      const prefs = await getNotificationPreferences();
      if (!cancelled) await registerForPush(prefs?.appEnabled !== false);
    };
    void sync();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void sync();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // Dodir na obavijest. Hook vraća i odgovor koji je pokrenuo hladni start.
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    router.push("/notifications");
  }, [response]);
}
