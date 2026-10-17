import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { API_ENDPOINTS } from "../app/config/api";
import { setToken } from "@/utils/tokenStore";

GoogleSignin.configure({
  webClientId:
    "707099608191-otqbo2ds41tl6dh27rh5i7eeuilullbc.apps.googleusercontent.com",
  offlineAccess: false,
});

interface GoogleAuthResponse {
  token: string;
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  needsBirthDate: boolean;
  needsPassword: boolean;
}

// Puni tok prijave/registracije putem Google računa: dohvaća Google idToken,
// šalje ga na /api/auth/google (koji po potrebi kreira korisnika) i tek
// nakon uspješnog odgovora s backenda sprema token i preusmjerava korisnika —
// bez ovoga gumb "Nastavi s Google računom" samo bi popunio polja, a
// korisnik ne bi bio stvarno prijavljen.
export function useGoogleAuth() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const signIn = async () => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      // Bez ovoga Google zna ponuditi samo "predloženi" (zadnje korišteni)
      // račun kroz brzi "One Tap" izbornik; ako ga korisnik odbije jer želi
      // prijaviti se drugim računom, taj izbornik nema opciju "drugi račun"
      // i cijela prijava se prekida s response.type "cancelled". Odjavom
      // prije prijave uvijek se prikazuje puni birač računa.
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        return;
      }

      const { idToken } = response.data;
      if (!idToken) {
        Alert.alert(t("common.error"), t("auth.googleErrorGeneric"));
        return;
      }

      const res = await fetch(API_ENDPOINTS.GOOGLE_AUTH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const data: GoogleAuthResponse & { message?: string } = await res.json();

      if (!res.ok) {
        Alert.alert(
          t("common.error"),
          data?.message || t("auth.googleErrorGeneric"),
        );
        return;
      }

      await setToken(data.token);
      await AsyncStorage.setItem("userId", data.userId.toString());
      await AsyncStorage.setItem("firstName", data.firstName ?? "");
      await AsyncStorage.setItem("lastName", data.lastName ?? "");
      await AsyncStorage.setItem("username", data.username ?? "");
      await AsyncStorage.setItem(
        "needsBirthDate",
        data.needsBirthDate ? "true" : "false",
      );

      if (data.needsPassword) {
        router.replace("/set-password");
      } else if (data.needsBirthDate) {
        router.replace("/complete-profile");
      } else {
        router.replace("/(tabs)");
      }
    } catch (error) {
      if (isErrorWithCode(error)) {
        // Android vraća DEVELOPER_ERROR kao numerički kod "10" (nije dio
        // statusCodes enuma iz JS SDK-a) — uzrok je uvijek pogrešna
        // konfiguracija na Google Cloud Console strani (SHA-1 certifikat
        // ili OAuth client ID ne odgovaraju aplikaciji), nikad nešto što
        // korisnik može sam ispraviti. Bez ove provjere korisnik bi vidio
        // generičku poruku ili sirovi "DEVELOPER_ERROR" tekst iz nativnog
        // sloja, što mu ništa ne govori o tome što se dogodilo.
        const isDeveloperError =
          String(error.code) === "10" ||
          /developer_error/i.test(error.message ?? "");

        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
          case statusCodes.IN_PROGRESS:
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            Alert.alert(
              t("common.error"),
              t("auth.googlePlayServicesUnavailable"),
            );
            break;
          default:
            console.error("Google Sign-In error:", error);
            Alert.alert(
              t("common.error"),
              isDeveloperError
                ? t("auth.googleErrorConfig")
                : t("auth.googleErrorGeneric"),
            );
        }
      } else {
        console.error("Unknown Google Sign-In error:", error);
        Alert.alert(t("common.error"), t("auth.googleErrorGeneric"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { promptAsync: signIn, isLoading, request: true };
}
