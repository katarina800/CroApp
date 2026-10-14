// components/TutorialModal.tsx
//
// Kratki vodič kroz aplikaciju.
//
// VARA na prvom otvaranju pokaže kartu i tu stane. Što se krije iza
// kategorija, da se doseg "Blizu mene" može mijenjati, da objava može biti
// događaj s datumom, da zvono prati kategorije — sve to se dosad moralo
// slučajno pronaći. Ovdje su četiri koraka koji to kažu naglas.
//
// Namjerno četiri, ne deset: vodič koji traje duže od pola minute se
// preskače, a onda ne koristi nikome. Svaki korak ima jednu sliku, jedan
// naslov i jednu rečenicu.

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Image,
  ImageSourcePropType,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useTheme } from "./AdaptiveThemeProvider";
import { T, V } from "../styles/varaTheme";
// Ikone doba dana (nove; stare viking kovanice su u LEGACY_ICONS, prekidač USE_LEGACY_ICONS).
import { APP_ICONS } from "../constants/icons";

/**
 * Vodič se otvara preko cijelog ekrana, pa mora pratiti odabranu temu —
 * inače bi korisniku u svijetloj temi jedini tamni ekran u aplikaciji bio
 * baš onaj koji je prvi vidi.
 */
type Palette = {
  bg: string;
  title: string;
  body: string;
  dim: string;
  dot: string;
  btnText: string;
};

const LIGHT: Palette = {
  bg: "#F5F0E8",
  title: "#2A2010",
  body: "#5A4A20",
  dim: "#8A7A50",
  dot: "#E0D090",
  btnText: "#FFFDF5",
};

const DARK: Palette = {
  bg: V.forestDeep,
  title: V.silverBright,
  body: V.silver,
  dim: V.silverDim,
  dot: V.borderDim,
  btnText: V.silverBright,
};

/** Podignut broj znači da će vodič ponovno vidjeti i oni koji su ga već prošli. */
const STORAGE_KEY = "vara_tutorial_seen_v1";

/**
 * Svaki korak pokazuje ONU ikonu koju korisnik stvarno dodiruje, a ne novu
 * nacrtanu za vodič. Poanta je prepoznavanje: tko je vidio ikonu u vodiču,
 * nađe je na ekranu. S nacrtanom zamjenom vodič samo opisuje, umjesto da
 * pokaže.
 *
 * Nekoliko koraka ima i male ikone ispod glavne — one imenuju upravo onaj
 * gumb o kojem rečenica govori (filtar po dobu dana, doseg, značke), da se
 * ne mora tražiti po ekranu.
 */
type Step = {
  /** Glavna slika iz aplikacije. */
  image?: number;
  /** Manje ikone ispod glavne; isti izvor kao u aplikaciji. */
  extras?: ImageSourcePropType[];
  /** Gumb "+" kakav stoji u Videima. */
  plusButton?: boolean;
  /** Zastavice — aplikacija jezike i inače prikazuje njima. */
  flags?: boolean;
  tint: string;
  titleKey: string;
  bodyKey: string;
};

const MAP_ICON = require("../assets/images/karta.png");
const VIDEO_ICON = require("../assets/images/video.png");
const NOTIF_ICON = require("../assets/images/obav.png");
const PLAN_ICON = require("../assets/images/put.png");
const VISITED_ICON = require("../assets/images/posmjesta.png");
const BADGES_ICON = require("../assets/images/uspjeh.png");
const RADIUS_ICON = require("../assets/images/radijus.png");
const MORNING_ICON = APP_ICONS.jutro as ImageSourcePropType;
const AFTERNOON_ICON = APP_ICONS.poslijepodne as ImageSourcePropType;
const EVENING_ICON = APP_ICONS.vecer as ImageSourcePropType;

const STEPS: Step[] = [
  {
    // Jezik ide prvi: tko aplikaciju ne čita na svom jeziku, to treba
    // saznati odmah, a ne na sedmom koraku.
    flags: true,
    tint: V.visited,
    titleKey: "tutorial.s1Title",
    bodyKey: "tutorial.s1Body",
  },
  {
    image: MAP_ICON,
    extras: [MORNING_ICON, AFTERNOON_ICON, EVENING_ICON],
    tint: V.visited,
    titleKey: "tutorial.s2Title",
    bodyKey: "tutorial.s2Body",
  },
  {
    image: VIDEO_ICON,
    extras: [RADIUS_ICON],
    tint: "#669CB7",
    titleKey: "tutorial.s3Title",
    bodyKey: "tutorial.s3Body",
  },
  {
    plusButton: true,
    tint: V.accentGold,
    titleKey: "tutorial.s4Title",
    bodyKey: "tutorial.s4Body",
  },
  {
    image: PLAN_ICON,
    tint: "#C59877",
    titleKey: "tutorial.s5Title",
    bodyKey: "tutorial.s5Body",
  },
  {
    image: VISITED_ICON,
    extras: [BADGES_ICON],
    tint: "#95AE5B",
    titleKey: "tutorial.s6Title",
    bodyKey: "tutorial.s6Body",
  },
  {
    image: NOTIF_ICON,
    tint: "#AD6452",
    titleKey: "tutorial.s7Title",
    bodyKey: "tutorial.s7Body",
  },
];

/** Iste zastavice koje stoje u biraču jezika (LanguageSelector). */
const FLAGS = ["🇭🇷", "🇬🇧", "🇩🇪", "🇫🇷", "🇮🇹"];

/** Je li vodič već prikazan. Greška u čitanju se tumači kao "jest" — bolje ga
 *  propustiti nego ga vrtjeti na svakom pokretanju. */
export async function hasSeenTutorial(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markTutorialSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ako se ne zapiše, vodič će se pojaviti opet — neugodno, ali bezopasno.
  }
}

function StepPage({
  step,
  width,
  c,
}: {
  step: Step;
  width: number;
  c: Palette;
}) {
  const { t } = useTranslation();

  // Sadržaj se pomiče unutar stranice. Koraka je sedam i neki nose dvije
  // rečenice — na niskom ekranu bi inače tekst ispao ispod ruba, a baš to
  // se htjelo pročitati.
  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 32,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          width: 132,
          height: 132,
          borderRadius: 66,
          backgroundColor: step.tint + "26",
          borderWidth: 1,
          borderColor: step.tint + "66",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        {step.flags ? (
          // Pet zastavica u dva reda — iste one iz biriča jezika.
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
            }}
          >
            {FLAGS.map((f) => (
              <Text key={f} style={{ fontSize: T.hero }}>
                {f}
              </Text>
            ))}
          </View>
        ) : step.plusButton ? (
          // Gumb za objavu iz Videa, u istom obliku kao ondje: krug s
          // rubom i plusom. Samo veći, da se vidi.
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: V.forestLight,
              borderWidth: 1.5,
              borderColor: V.borderGreen,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={44} color="#fff" />
          </View>
        ) : (
          // Slike nisu kvadratne (npr. 195×273), pa "contain" unutar
          // kvadrata — isto kao u donjoj traci.
          <Image
            source={step.image}
            style={{ width: 76, height: 76 }}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Male ikone imenuju točno onaj gumb o kojem rečenica govori, pa ga
          korisnik ne mora tražiti po ekranu. */}
      {!!step.extras?.length && (
        <View
          style={{
            flexDirection: "row",
            gap: 14,
            marginTop: -18,
            marginBottom: 26,
          }}
        >
          {step.extras.map((ex, i) => (
            <View
              key={i}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: step.tint + "1F",
                borderWidth: 1,
                borderColor: step.tint + "4D",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                source={ex}
                style={{ width: 26, height: 26 }}
                resizeMode="contain"
              />
            </View>
          ))}
        </View>
      )}

      <Text
        style={{
          color: c.title,
          fontSize: T.screen,
          fontWeight: "800",
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        {t(step.titleKey)}
      </Text>

      <Text
        style={{
          color: c.body,
          fontSize: T.lead,
          lineHeight: 24,
          textAlign: "center",
        }}
      >
        {t(step.bodyKey)}
      </Text>
    </ScrollView>
  );
}

export function TutorialModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const c: Palette = isDark ? DARK : LIGHT;
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Step>>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const isLast = index === STEPS.length - 1;

  const finish = () => {
    markTutorialSeen();
    onClose();
  };

  const next = () => {
    if (isLast) {
      finish();
      return;
    }
    const target = index + 1;
    listRef.current?.scrollToIndex({ index: target, animated: true });
    setIndex(target);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={finish}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {/* "Preskoči" stoji od prvog koraka. Vodič koji se ne da zatvoriti
            iritira više nego što pomaže. */}
        <View style={{ alignItems: "flex-end", padding: 16, paddingTop: 52 }}>
          <TouchableOpacity
            onPress={finish}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            accessibilityRole="button"
          >
            <Text style={{ color: c.dim, fontSize: T.body, fontWeight: "600" }}>
              {t("tutorial.skip")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <FlatList
            ref={listRef}
            data={STEPS}
            keyExtractor={(s) => s.titleKey}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            // Bez getItemLayout scrollToIndex promaši stranicu, jer FlatList
            // još ne zna koliko je koja široka.
            getItemLayout={(_, i) => ({
              length: width,
              offset: width * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / width);
              if (next !== index) setIndex(next);
            }}
            renderItem={({ item }) => (
              <StepPage step={item} width={width} c={c} />
            )}
          />
        </View>

        <View style={{ paddingHorizontal: 28, paddingBottom: 44 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            {STEPS.map((s, i) => (
              <View
                key={s.titleKey}
                style={{
                  width: i === index ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === index ? V.visited : c.dot,
                }}
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={next}
            style={{
              backgroundColor: V.visited,
              borderRadius: 12,
              paddingVertical: 15,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(232,237,228,0.22)",
            }}
            accessibilityRole="button"
          >
            <Text
              style={{ color: c.btnText, fontSize: T.lead, fontWeight: "700" }}
            >
              {isLast ? t("tutorial.start") : t("tutorial.next")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
