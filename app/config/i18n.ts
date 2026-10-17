import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "../locales/de.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import hr from "../locales/hr.json";
import it from "../locales/it.json";
import { API_BASE_URL } from "./api";
import { getToken } from "@/utils/tokenStore";

const LANGUAGE_KEY = "vara_language";

// Dohvati spremljeni jezik ili koristi jezik uređaja
const getStoredLanguage = async (): Promise<string> => {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (stored) return stored;

    // Fallback na jezik uređaja
    const deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
    const supported = ["hr", "en", "it", "de", "fr"];
    return supported.includes(deviceLang) ? deviceLang : "en";
  } catch {
    return "en";
  }
};

export const saveLanguage = async (lang: string) => {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  i18n.changeLanguage(lang);

  try {
    const token = await getToken(); // provjeri da li je ovo stvarni ključ u tvom kodu!
    if (token) {
      await fetch(`${API_BASE_URL}/api/auth/language`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: lang }),
      });
    }
  } catch {}
};

i18n.use(initReactI18next).init({
  resources: {
    hr: { translation: hr },
    en: { translation: en },
    it: { translation: it },
    de: { translation: de },
    fr: { translation: fr },
  },
  lng: "hr",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Postavi jezik pri pokretanju.
//
// i18n se inicijalizira sinkrono na "hr" jer resursi moraju postojati prije
// prvog iscrtavanja, a spremljeni jezik stiže tek iz AsyncStoragea. Sve što
// tekst SAMO prikazuje to ne osjeti — komponente se ponovno iscrtaju kad
// changeLanguage prođe. Ali jednokratna poruka (Alert) uhvati jezik kakav je
// bio u tom trenutku: prikaže li se odmah po pokretanju, ispadne hrvatska i
// korisniku koji je odabrao njemački ili francuski.
//
// Zato se ovo čekanje izvozi — tko piše Alert odmah po pokretanju, prvo ga
// pričeka.
export const languageReady: Promise<void> = getStoredLanguage()
  .then((lang) => i18n.changeLanguage(lang))
  .then(() => undefined)
  .catch(() => undefined);

export default i18n;
