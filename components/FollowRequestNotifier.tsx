// components/FollowRequestNotifier.tsx
//
// Obavijest primatelju da ga netko želi pratiti.
//
// Zahtjevi za praćenje privatnog profila su dosad postojali samo "pasivno":
// pošiljatelj bi ga poslao iz pretrage, a primatelj o tome nije doznao ništa
// dok sam ne bi otvorio Profil → Zahtjevi za praćenje. U praksi to znači da
// zahtjev zna stajati danima jer čovjek nema razloga tamo zaviriti.
//
// Ovdje se zahtjevi provjeravaju dok je aplikacija otvorena i za svaki NOVI
// zahtjev prikaže se obavijest s tri izbora: Prihvati, Odbij i Kasnije.
// Prihvaćanje/odbijanje ide na iste endpointe koje koristi i popis u profilu,
// pa su oba mjesta uvijek usklađena. Sve poruke idu kroz i18n, dakle prikazuju
// se na jeziku koji je korisnik odabrao.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AppState } from "react-native";
import { API_BASE_URL } from "../app/config/api";
import { useActivePolling } from "@/hooks/use-active-polling";
import { getToken } from "@/utils/tokenStore";

const POLL_INTERVAL_MS = 60_000;
// Zahtjevi na koje je korisnik rekao "Kasnije" pamte se da ga se ne pita
// iznova svakih minutu — i dalje su vidljivi u profilu, sa značkom.
const SNOOZED_KEY = "snoozedFollowRequests";

interface PendingRequest {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export default function FollowRequestNotifier() {
  const { t } = useTranslation();
  // Zahtjevi za koje je obavijest već prikazana u ovom pokretanju aplikacije —
  // bez toga bi se isti dijalog vraćao pri svakoj provjeri.
  const promptedRef = useRef<Set<number>>(new Set());
  const showingRef = useRef(false);

  const respond = useCallback(
    async (requesterId: number, action: "accept" | "decline") => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(
          `${API_BASE_URL}/api/follow/requests/${requesterId}/${action}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch {
        // Ako poziv ne uspije, zahtjev ostaje na popisu u profilu pa se
        // radnja može ponoviti — namjerno bez alarmantne poruke.
      }
    },
    [],
  );

  const snooze = useCallback(async (requesterId: number) => {
    try {
      const raw = await AsyncStorage.getItem(SNOOZED_KEY);
      const ids: number[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(requesterId)) {
        await AsyncStorage.setItem(
          SNOOZED_KEY,
          JSON.stringify([...ids, requesterId]),
        );
      }
    } catch {}
  }, []);

  const checkRequests = useCallback(async () => {
    // Nikad dva dijaloga odjednom.
    if (showingRef.current) return;

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE_URL}/api/follow/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const requests: PendingRequest[] = await res.json();
      if (!Array.isArray(requests) || requests.length === 0) return;

      const raw = await AsyncStorage.getItem(SNOOZED_KEY);
      const snoozed: number[] = raw ? JSON.parse(raw) : [];

      const next = requests.find(
        (r) => !promptedRef.current.has(r.id) && !snoozed.includes(r.id),
      );
      if (!next) return;

      promptedRef.current.add(next.id);
      showingRef.current = true;

      const name =
        [next.firstName, next.lastName].filter(Boolean).join(" ").trim() ||
        next.username ||
        "";

      Alert.alert(
        t("follow.requestTitle"),
        t("follow.requestMessage", { name }),
        [
          {
            text: t("follow.decline"),
            style: "destructive",
            onPress: () => {
              showingRef.current = false;
              respond(next.id, "decline");
            },
          },
          {
            text: t("follow.later"),
            style: "cancel",
            onPress: () => {
              showingRef.current = false;
              snooze(next.id);
            },
          },
          {
            text: t("follow.accept"),
            onPress: () => {
              showingRef.current = false;
              respond(next.id, "accept");
            },
          },
        ],
        { cancelable: false },
      );
    } catch {}
  }, [respond, snooze, t]);

  useEffect(() => {
    checkRequests();
  }, [checkRequests]);

  // Provjera staje dok je aplikacija u pozadini i nastavlja se (uz jednu
  // odmah izvršenu provjeru) kad se korisnik vrati. Prije je interval radio
  // i u pozadini, pa je aplikacija budila mrežu svakih 60 sekundi cijelu noć.
  useActivePolling(checkRequests, POLL_INTERVAL_MS);

  return null;
}
