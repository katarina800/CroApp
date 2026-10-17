// app/_layout.tsx
import * as Linking from "expo-linking";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Text, View } from "react-native";
import { AdaptiveThemeProvider } from "../components/AdaptiveThemeProvider"; // ← NOVO
import FollowRequestNotifier from "../components/FollowRequestNotifier";
import { API_BASE_URL } from "./config/api";
import "./config/i18n"; // ← dodaj ovo kao prvi import
import * as Sentry from "@sentry/react-native";
import { initSentry, sentryEnabled } from "./config/sentry";
import { installApiGuard, setUnauthorizedHandler } from "../utils/apiFetch";
import { clearSession, isTokenExpired } from "../utils/session";
import i18n from "./config/i18n";
import { UserProvider } from "./contexts/UserContext";
import { getToken } from "@/utils/tokenStore";

const trackSessionTime = async (minutes: number) => {
  try {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/api/activity/track/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ minutes }),
    });
  } catch {}
};

// Mora se pozvati prije nego se išta iscrta, da se uhvati i pad pri
// samom pokretanju — a ne tek onaj koji se dogodi nakon prvog rendera.
initSentry();

// Svi pozivi prema našem poslužitelju dobivaju timeout (20 s) i jedinstvenu
// obradu istekle prijave — vidi utils/apiFetch.
installApiGuard(API_BASE_URL);
setUnauthorizedHandler(async () => {
  await clearSession();
  router.replace("/login");
  Alert.alert(i18n.t("common.error"), i18n.t("common.sessionExpired"));
});

function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Praćenje vremena provedenog u aplikaciji — MORA biti ovdje, u root
  // layoutu koji živi cijelo trajanje sesije, ne unutar profil taba. Prije
  // je ovo bilo u ProfileScreen-u, pa se mjerilo samo vrijeme provedeno na
  // profil tabu (koje se gotovo uvijek zaokruži na 0 minuta), a ne stvarno
  // ukupno korištenje aplikacije — otud je arhiva aktivnosti uvijek
  // pokazivala 0 minuta.
  useEffect(() => {
    let sessionStart = Date.now();
    let isTracking = false;
    const trackCurrentSession = async () => {
      if (isTracking) return;
      isTracking = true;
      const minutes = Math.floor((Date.now() - sessionStart) / (1000 * 60));
      if (minutes > 0) await trackSessionTime(minutes);
      isTracking = false;
    };
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "background" || nextAppState === "inactive") {
          await trackCurrentSession();
        } else if (nextAppState === "active") {
          sessionStart = Date.now();
        }
      },
    );
    return () => {
      subscription.remove();
      const finalMinutes = Math.floor(
        (Date.now() - sessionStart) / (1000 * 60),
      );
      if (finalMinutes > 0) trackSessionTime(finalMinutes);
    };
  }, []);

  useEffect(() => {
    // Handle deep link kada je app zatvorena (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) {
        const { path } = Linking.parse(url);
        // Ne navigiraj odmah - checkAuth će se pobrinuti za routing
        // Samo logiraj za debug
        console.log("🔗 Initial deep link:", url, "path:", path);
      }
    });

    // Handle deep link kada je app u pozadini (warm start)
    const subscription = Linking.addEventListener("url", (event) => {
      const { path } = Linking.parse(event.url);
      console.log("🔗 Deep link received:", event.url, "path:", path);
      if (path === "login") {
        router.replace("/login");
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Kratki delay da se Expo Router navigator inicijalizira
    // prije nego pozovemo router.replace()
    const timer = setTimeout(() => {
      checkAuth();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const checkAuth = async () => {
    try {
      const token = await getToken();

      // Prije se gledalo samo POSTOJI li token. Token vrijedi 7 dana, pa je
      // osmog dana korisnik ulazio u aplikaciju u kojoj svaki zahtjev vraća
      // 401 — a kako ekrani grešku gutaju, to je izgledalo kao da su podaci
      // nestali: nula pratitelja, nema poruka, nema videa, profilna slika
      // pala na inicijale. Rok isteka piše u samom tokenu, pa se provjerava
      // odmah i bez mreže.
      const expired = isTokenExpired(token);
      console.log(
        "🔑 Token:",
        token ? (expired ? "istekao" : "valjan") : "nema",
      );

      if (expired && token) await clearSession();

      setReady(true);

      if (token && !expired) {
        console.log("➡️ Navigating to /(tabs)");
        router.replace("/(tabs)");
      } else {
        console.log("➡️ Navigating to /login");
        router.replace("/login");
      }
    } catch (err: any) {
      console.error("❌ Auth/Navigation error:", err?.message);
      setError(err?.message ?? "Nepoznata greška");
      setReady(true);
    }
  };

  // DEV error screen – vidi što puca
  if (error) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: "#1B3F0E",
        }}
      >
        <Text
          style={{
            color: "#ff4757",
            fontSize: 18,
            fontWeight: "bold",
            marginBottom: 12,
          }}
        >
          ❌ Greška pri pokretanju
        </Text>
        <Text
          style={{
            color: "#fff",
            fontSize: 13,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          {error}
        </Text>
      </View>
    );
  }

  // Loading dok se auth provjerava
  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1B3F0E",
        }}
      >
        <ActivityIndicator size="large" color="#D1DADB" />
        <Text
          style={{
            color: "rgba(255,255,255,0.5)",
            marginTop: 16,
            fontSize: 13,
          }}
        >
          Pokretanje...
        </Text>
      </View>
    );
  }

  return (
    <AdaptiveThemeProvider>
      <UserProvider>
        {/* Obavijest o zahtjevu za praćenje — mora biti ovdje, u layoutu koji
            živi cijelo vrijeme, da primatelj zahtjev vidi bez obzira na kojem
            je ekranu (dosad se za njega doznalo samo ručnim otvaranjem
            Profil → Zahtjevi za praćenje). */}
        <FollowRequestNotifier />
        {/* Svi ekrani uvijek registrirani – ne uvjetno */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="verify-email" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile/[userId]" />
          <Stack.Screen name="chat/[userId]" />
          <Stack.Screen name="admin/login" />
          <Stack.Screen name="adminn/dashboard" />
        </Stack>
      </UserProvider>
    </AdaptiveThemeProvider>
  );
}

// Sentryjev omotač dodaje praćenje navigacije i hvata greške koje bi inače
// prošle pokraj React granice grešaka. Kad prijavljivanje nije uključeno
// (razvoj ili DSN nije postavljen), izvozi se nedirnuta komponenta.
export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;
