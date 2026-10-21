// app/(tabs)/dashboard.tsx  ─  v5
// Promjene:
//   1. Brza lokacija — Balanced accuracy → zatim High u pozadini
//   2. Network error za profil — tiho ignorira, ne crasha app
//   3. Limit od 10 rezultata po kategoriji + "Prikaži više" gumb
//   4. Strogi filteri dolaze iz locationService.ts (v5)
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  FlatList,
  Image,
  ImageSourcePropType,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Circle, Marker, Region } from "react-native-maps";
import { useTheme } from "../../components/AdaptiveThemeProvider";
import { PlanMyDayModal } from "../../components/PlanMyDayModal";
import { UnsavedBar } from "../../components/UnsavedBar";
import { T, TAP_SLOP, V, ag, dm, pb, pr, s } from "../../styles/varaTheme";
import { API_BASE_URL } from "../config/api";
import {
  useInputBottomOffset,
  useKeyboardHeight,
} from "@/hooks/use-keyboard-offset";
import { useActivePolling } from "@/hooks/use-active-polling";
import { isOpenAt, isOpenDuringWindow } from "@/utils/openingHours";
import { findPlaceNew, placePhotoUrl } from "@/app/services/googlePlacesNew";
import { fetchGoogleNearby } from "@/app/services/googleNearby";
// Ikone (nove; stare viking kovanice su u LEGACY_ICONS, prekidač USE_LEGACY_ICONS).
import { APP_ICONS } from "../../constants/icons";
import { NotificationsModal } from "@/components/NotificationsModal";
import {
  getNotificationPreferences,
  getUnreadCount,
  saveFailureDetail,
  saveFailureMessageKey,
  saveNotificationPreferences,
} from "@/utils/notificationsApi";
import {
  AreaActivitiesSheet,
  AreaPoint,
} from "@/components/AreaActivitiesSheet";
import {
  POST_CATEGORY_IDS,
  geocodeCity,
  getPlacesInRadius,
  getPlacesInRadiusDetailed,
  nameMatchesDenylist,
  Place,
  placeCategories,
  searchPlaces,
} from "../services/locationService";
import { getToken } from "@/utils/tokenStore";

function getDashColors(isDark: boolean) {
  return {
    bg: isDark ? "#1a2e1a" : "#f0ede4",
    card: isDark ? "#2a4230" : "#e4ead8",
    cardHover: isDark ? "#3a5a30" : "#ccdcb8",
    border: isDark ? "#4a7040" : "#5a8a40",
    borderDim: isDark ? "#3a5a30" : "#c0d0a8",
    text: isDark ? "#e8e8e8" : "#1a2a18",
    textSub: isDark ? "#c0c0c0" : "#3a4a35",
    textDim: isDark ? "#a0a0a0" : "#5a6a55",
    accent: isDark ? "#5a8a48" : "#3a6a28",
    gold: "#B8A060",
    inputBg: isDark ? "#2a4230" : "#e4ead8",
    inputBorder: isDark ? "#4a7040" : "#5a8a40",
    danger: isDark ? "#8B3030" : "#7a2020",
    overlay: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)",
    headerText: isDark ? "#e8e8e8" : "#1a2a18",
    headerSub: isDark ? "#b0b0b0" : "#5a6a55",
    chip: isDark ? "#2a4230" : "#e4ead8",
    chipActive: isDark ? "#3a5a30" : "#ccdcb8",
    chipBorder: isDark ? "#3a5a30" : "#c0d0a8",
    chipBorderActive: isDark ? "#5a8a48" : "#3a6a28",
    msgBubble: isDark ? "#2a4230" : "#e4ead8",
    msgBubbleMine: isDark ? "#3a5a30" : "#ccdcb8",
  } as const;
}

const visitedIcon = APP_ICONS.visited;
const planIcon = APP_ICONS.planDay;
const groupsIcon = APP_ICONS.groups;
const badgesIcon = APP_ICONS.badges;
const notificationsIcon = APP_ICONS.notifications;
const archiveIcon = APP_ICONS.archive;
const locationPinIcon = require("../../assets/images/igla.png");
const radiusIcon = APP_ICONS.radius;
const zoomInIcon = require("../../assets/images/zoomin.png");
const zoomOutIcon = require("../../assets/images/zoomout.png");
const morningIcon = APP_ICONS.jutro;
const afternoonIcon = APP_ICONS.poslijepodne;
const eveningIcon = APP_ICONS.vecer;
const restaurantIcon = APP_ICONS.restaurant;
const cafeIcon = APP_ICONS.cafe;
const clubIcon = APP_ICONS.club;
const beachIcon = APP_ICONS.beach;
const landmarkIcon = APP_ICONS.landmark;
const opgIcon = APP_ICONS.opg;
const accommodationIcon = APP_ICONS.accommodation;
const marketIcon = APP_ICONS.market;
const paintballIcon = APP_ICONS.paintball;
const cinemaIcon = APP_ICONS.cinema;
const parkIcon = APP_ICONS.park;
const escapeRoomIcon = APP_ICONS.escapeRoom;
const museumIcon = APP_ICONS.museum;
const theaterIcon = APP_ICONS.theater;
const mountainIcon = APP_ICONS.mountain;
const nationalParkIcon = APP_ICONS.nationalPark;
const caveIcon = APP_ICONS.cave;
const spaIcon = APP_ICONS.spa;
const putnikIcon = APP_ICONS.traveller;
const maloletnikIcon = APP_ICONS.ageMinors;
const mladiIcon = APP_ICONS.ageYouth;
const studentIcon = APP_ICONS.ageStudents;
const odrasliIcon = APP_ICONS.ageAdults;
const umirovljenikIcon = APP_ICONS.ageRetired;
const soloIcon = require("../../assets/images/sam.png");
const partnerIcon = require("../../assets/images/partner.png");
const prijateljIcon = require("../../assets/images/prijatelj.png");
const obiteljIcon = require("../../assets/images/obitelj.png");
const mjesovitIcon = require("../../assets/images/mjesovit.png");

// Transport (prijevoz)
const autoIcon = require("../../assets/images/auto.png");
const javniIcon = require("../../assets/images/javni.png");
const pjesiceIcon = require("../../assets/images/pjesice.png");
const biciklIcon = require("../../assets/images/bicikl.png");

// Preference (aktivnosti)
const otvorenIcon = require("../../assets/images/otvoren.png");
const zatvorenoIcon = require("../../assets/images/zatvoreno.png");
const kombiniranoIcon = require("../../assets/images/kombinirano.png");

// Preset avatari — prilagodi putanje prema svom profile screenu
// Promjena 1 — ispravne putanje (s crticom, ne underscore)
const AVATAR_MALE = require("../../assets/images/avatar-male.png");
const AVATAR_FEMALE = require("../../assets/images/avatar-female.png");

const PRESET_AVATARS: Record<string, any> = {
  "avatar:male": AVATAR_MALE,
  "avatar:female": AVATAR_FEMALE,
};

function resolveAvatarUrl(
  avatar: string | null | undefined,
  apiBaseUrl: string,
): string | null {
  if (!avatar || avatar === "") return null;
  if (avatar.startsWith("avatar:")) return avatar;
  if (avatar.startsWith("http")) return avatar;
  return `${apiBaseUrl}/${avatar.replace(/^\//, "")}`;
}

const CATEGORY_ICONS: Record<string, any> = {
  restaurant: restaurantIcon,
  cafe: cafeIcon,
  club: clubIcon,
  beach: beachIcon,
  landmark: landmarkIcon,
  opg: opgIcon,
  accommodation: accommodationIcon,
  market: marketIcon,
  paintball: paintballIcon,
  cinema: cinemaIcon,
  park: parkIcon,
  escapeRoom: escapeRoomIcon,
  museum: museumIcon,
  theater: theaterIcon,
  mountain: mountainIcon,
  nationalPark: nationalParkIcon,
  cave: caveIcon,
  spa: spaIcon,
  other: APP_ICONS.other,
};

/**
 * Ikona kategorije.
 *
 * Svaka kategorija ima svoju kovanicu (viking PNG). "Ostalo" je nema — nije
 * vrsta mjesta pa za nju nikad nije nacrtana. Dok je nije bilo, crtao se goli
 * emoji: 56px znaka pokraj 96px kovanice izgledao je kao da je netko zaboravio
 * sliku.
 *
 * Ovdje se emoji stavlja u kovanicu istog promjera — drveni krug sa zlatnim
 * obodom, kakav imaju i ostale. Kad ostalo.png bude gotov, dovoljno ga je
 * dodati u CATEGORY_ICONS i ovo se više neće koristiti.
 */
function CategoryCoin({
  id,
  fallbackGlyph,
  size,
  style,
}: {
  id: string;
  fallbackGlyph: string;
  size: number;
  style?: any;
}) {
  const source = CATEGORY_ICONS[id];
  if (source) {
    return (
      <Image
        source={source}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
      />
    );
  }

  const COIN_WOOD = "#2E2216";
  const COIN_GOLD = "#C9A227";
  const COIN_GOLD_DIM = "#8A6A2F";
  // Kovanica ne ispunjava cijeli PNG do ruba, pa ni ova ne smije — inače bi
  // pokraj ostalih djelovala krupnije.
  const coin = Math.round(size * 0.86);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View
        style={{
          width: coin,
          height: coin,
          borderRadius: coin / 2,
          backgroundColor: COIN_WOOD,
          borderWidth: Math.max(2, Math.round(coin * 0.045)),
          borderColor: COIN_GOLD,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: coin * 0.78,
            height: coin * 0.78,
            borderRadius: (coin * 0.78) / 2,
            borderWidth: 1,
            borderColor: COIN_GOLD_DIM,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: Math.round(coin * 0.42) }}>
            {fallbackGlyph}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  ms = 7000,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}
function haversineKm(a1: number, o1: number, a2: number, o2: number) {
  const R = 6371,
    dA = ((a2 - a1) * Math.PI) / 180,
    dO = ((o2 - o1) * Math.PI) / 180;
  const a =
    Math.sin(dA / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) *
      Math.cos((a2 * Math.PI) / 180) *
      Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const { width: SW, height: SH } = Dimensions.get("window");
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const STORAGE_REVIEWS = "cromap_reviews_v4";
const STORAGE_HIDDEN = "cromap_hidden_v4";
const STORAGE_BADGES = "cromap_badges_v4";
const STORAGE_GROUPS = "cromap_groups_v4";
const STORAGE_NOTIFS = "cromap_notif_prefs_v4";
const STORAGE_VISITS = "cromap_visits_v1";
const STORAGE_TYPES = "cromap_selected_types_v1";
const STORAGE_RADIUS = "cromap_map_radius_v1";
/** Izbor radijusa pretrage (km) — isti na karti i na ploči s filterima. */
const RADIUS_CHOICES = [5, 10, 25, 50, 100] as const;

// Karta se prije otvarala prazna: dok korisnik sam ne otvori "Kategorije" i
// nešto označi, na njoj nema ničega, pa prvi dojam ne pokaže što aplikacija
// radi. Zato su pri prvom pokretanju uključene tri kategorije kojih ima
// posvuda i koje odgovaraju gotovo svakome. Korisnikov izbor se od tada
// pamti — ovo vrijedi samo dok ništa nije spremljeno.
const DEFAULT_TYPES = ["cafe", "restaurant", "park"];

// Početni limit rezultata na karti. Više od desetak markera odjednom karti
// oduzima preglednost; korisnik ih postupno dodaje ("+10 više").
const INITIAL_RESULTS_LIMIT = 10;
/** Za koliko se limit povećava jednim dodirom na "više". */
const RESULTS_STEP = 10;

/**
 * Poredak za prikaz kad je odabrano više kategorija: naizmjence po jedno
 * mjesto iz svake (najbliža prva). Inače bi prvih 10 najbližih mjesta mogla
 * biti sve kafići, a ostale odabrane kategorije bi se na karti pojavile tek
 * nakon "više".
 */
function interleaveByType<T extends { type: string }>(
  list: T[],
  typeOrder: string[],
): T[] {
  const buckets = typeOrder.map((ty) => list.filter((p) => p.type === ty));
  const rest = list.filter((p) => !typeOrder.includes(p.type));
  const out: T[] = [];
  for (let i = 0; buckets.some((b) => i < b.length); i++) {
    for (const b of buckets) if (i < b.length) out.push(b[i]);
  }
  return [...out, ...rest];
}
/** Nakon ovoliko sekundi učitavanje se prekida i nudi "Ponovi", što god se dogodilo ispod. */
const LOAD_WATCHDOG_MS = 25000;

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlaceReview {
  placeId: string;
  stars: number;
  comment: string;
  wantToReturn: boolean;
  reviewedAt: string;
}
interface VisitRecord {
  id: string;
  placeId: string;
  placeName: string;
  placeType: string;
  latitude: number;
  longitude: number;
  address?: string;
  visitedAt: string;
}
interface Badge {
  category: string;
  level: number;
  earnedAt: string;
}
interface ActivityGroup {
  id: string;
  creatorName: string;
  creatorAvatar?: string;
  activity: string;
  description: string;
  latitude: number;
  longitude: number;
  locationName: string;
  maxPeople: number;
  members: string[];
  messages: { name: string; text: string; time: string }[];
  createdAt: string;
}
interface NotifPrefs {
  appEnabled: boolean;
  emailEnabled: boolean;
  email: string;
  categories: string[];
  ageGroups?: string[];
  /** Prima li sadržaj i izvan svojih krajeva ("Svugdje" u videima). */
  globalEnabled?: boolean;
  /** Domet "blizu mene" u kilometrima; postavlja se u videima. */
  radiusKm?: number;
}

interface VenueItem {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
}

interface DayRoute {
  label: string;
  color: string;
  stops: { venue: VenueItem; type: string; order: number }[];
  coordinates: { latitude: number; longitude: number }[];
}

const ROUTE_COLORS = [V.visited, "#AD6452", "#669CB7", V.accentGold, "#9D57A8"];
const ROUTE_LABELS = ["A", "B", "C", "D", "E"];

// ZAMIJENI stari CATEGORY_HOURS tip i konstantu s ovim:

interface HourRange {
  open: number;
  close: number;
  days?: number[]; // 0=ned, 1=pon, 2=uto, 3=sri, 4=čet, 5=pet, 6=sub
  // ako nije navedeno → vrijedi svaki dan
}

const CATEGORY_HOURS: Record<string, HourRange[]> = {
  // ── HRANA & PIĆE ──────────────────────────────────────────────
  cafe: [
    { open: 7, close: 22, days: [1, 2, 3, 4, 5] }, // pon–pet
    { open: 8, close: 22, days: [6] }, // sub
    { open: 9, close: 21, days: [0] },
  ],
  restaurant: [
    { open: 11, close: 23, days: [1, 2, 3, 4, 5] },
    { open: 11, close: 23, days: [6, 0] }, // sub+ned — većina radi
  ],
  club: [
    { open: 23, close: 28, days: [4, 5, 6] }, // čet, pet, sub (ned ujutro)
    // Nedjelja i pon–sri: zatvoreno → nema range-a
  ],

  // ── PRIRODA & SPORT ───────────────────────────────────────────
  beach: [{ open: 6, close: 21 }], // svi dani
  park: [{ open: 6, close: 22 }], // svi dani
  mountain: [{ open: 5, close: 20 }],
  nationalPark: [{ open: 7, close: 20 }],
  cave: [
    { open: 9, close: 18, days: [1, 2, 3, 4, 5, 6] },
    { open: 10, close: 16, days: [0] }, // ned kraće
  ],
  paintball: [
    { open: 9, close: 21, days: [1, 2, 3, 4, 5] },
    { open: 10, close: 21, days: [6, 0] },
  ],

  // ── KULTURA & ZABAVA ──────────────────────────────────────────
  museum: [
    { open: 9, close: 20, days: [1, 2, 3, 4, 5] }, // pon–pet
    { open: 10, close: 18, days: [6] }, // sub
    { open: 10, close: 14, days: [0] }, // ned samo prijepodne (ili zatvoreno)
    // Ako želiš da ned = zatvoreno, izbriši zadnji red
  ],
  theater: [
    { open: 19, close: 23, days: [1, 2, 3, 4, 5, 6] }, // ned uglavnom ne radi
  ],
  cinema: [
    { open: 14, close: 23, days: [1, 2, 3, 4, 5] },
    { open: 11, close: 24, days: [6, 0] }, // sub+ned od podneva
  ],
  landmark: [{ open: 8, close: 21 }], // vanjski — uvijek
  escapeRoom: [
    { open: 10, close: 23, days: [1, 2, 3, 4, 5] },
    { open: 10, close: 23, days: [6, 0] },
  ],

  // ── KUPOVINA & USLUGE ─────────────────────────────────────────
  market: [
    { open: 7, close: 14, days: [1, 2, 3, 4, 5, 6] }, // pon–sub
    // ned = zatvoreno
  ],
  opg: [
    { open: 8, close: 18, days: [1, 2, 3, 4, 5, 6] },
    { open: 9, close: 14, days: [0] },
  ],

  // ── WELLBEING ─────────────────────────────────────────────────
  spa: [
    { open: 9, close: 21, days: [1, 2, 3, 4, 5] },
    { open: 10, close: 20, days: [6, 0] },
  ],

  // ── SMJEŠTAJ ─────────────────────────────────────────────────
  accommodation: [{ open: 0, close: 24 }],
};

/**
 * Vraća true ako je kategorija trenutno otvorena (prema tipičnim satima).
 * @param type  - ključ kategorije (npr. "cafe", "club")
 * @param nowH  - trenutni sat + minute kao decimalni broj (npr. 14.5 = 14:30)
 */
// ZAMIJENI staru isCategoryOpenNow s ovom:

function isCategoryOpenNow(
  type: string,
  nowH: number,
  dayOfWeek?: number,
): boolean {
  const ranges = CATEGORY_HOURS[type];
  if (!ranges) return true; // nepoznata kategorija → prikaži

  const day = dayOfWeek ?? new Date().getDay(); // 0=ned, 1=pon ... 6=sub

  return ranges.some(({ open, close, days }) => {
    // provjeri dan — ako days nije naveden, vrijedi svaki dan
    if (days !== undefined && !days.includes(day)) return false;

    if (close <= 24) {
      return nowH >= open && nowH < close;
    } else {
      // prelazi ponoć (npr. club 23–28 = 23:00–04:00)
      return nowH >= open || nowH < close - 24;
    }
  });
}

/**
 * Vraća decimalni sat od trenutne lokalne naredbe korisnika.
 * Npr. 14:30 → 14.5
 */
function getCurrentHour(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

// ── Svaka doba dana ima svoje kategorije i minimalni raspon otvorenosti ───────
// TIME_CATS je već definiran u kodu — ne trebate ga mijenjati.
// Dodajemo samo ovu "idealnu" mapu za prikaz u filtru (informativno):
const TOD_HOURS: Record<string, { label: string; from: number; to: number }> = {
  jutro: { label: "06:00 – 12:00", from: 6, to: 12 },
  poslijepodne: { label: "12:00 – 18:00", from: 12, to: 18 },
  vecer: { label: "18:00 – 24:00", from: 18, to: 24 },
};

const ACTIVITY_DURATION: Record<string, number> = {
  cafe: 45, // kava/doručak ~45 min
  restaurant: 75, // ručak/večera ~75 min
  museum: 90,
  landmark: 50,
  beach: 150,
  park: 45,
  cinema: 110, // film ~100min + dolazak
  theater: 120,
  escapeRoom: 75,
  paintball: 90,
  spa: 120,
  club: 180,
  market: 40,
  nationalPark: 180,
  cave: 60,
  opg: 60,
  mountain: 240,
  accommodation: 0,
};
const TRAVEL_MIN = 15;

// ─── Category meta ────────────────────────────────────────────────────────────
const EMOJIS: Record<string, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  club: "🎵",
  beach: "🏖️",
  landmark: "🏰",
  opg: "🌾",
  accommodation: "🏨",
  market: "🛒",
  paintball: "🎯",
  cinema: "🎬",
  park: "🌳",
  escapeRoom: "🔐",
  museum: "🏛️",
  theater: "🎭",
  mountain: "⛰️",
  nationalPark: "🏞️",
  cave: "🕳️",
  spa: "💧",
  // "Ostalo" još nema svoju kovanicu kao ostale kategorije. Dok je ne
  // dobije, prikazuje se ovaj znak umjesto zadanog 📍, koji na karti već
  // znači "mjesto" pa bi ovdje zbunjivao. CategoryCoin ga stavlja u drveni
  // krug sa zlatnim obodom, da uz kovanice ne strši.
  //
  // Kad slika bude gotova: stavi assets/images/ostalo.png (isti viking
  // stil, kovanica na drvu, ~512×512 PNG) i ovdje gore dodaj
  //   const otherIcon = require("../../assets/images/ostalo.png");
  // te u CATEGORY_ICONS red  other: otherIcon,
  // — mreža kategorija sama preferira sliku pred znakom.
  other: "🧭",
};

const BOTTOM_NAV_HEIGHT = Platform.OS === "ios" ? 82 : 66;

/** Jedna kontrola s desne strane karte: ikona + čitljiva oznaka (>=10px). */
function MapCtrlButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: ImageSourcePropType;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[UI_STYLES.mapCtrlBtn, active && UI_STYLES.mapCtrlBtnActive]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
    >
      <Image source={icon} style={UI_STYLES.mapCtrlIcon} resizeMode="contain" />
      <Text style={UI_STYLES.mapCtrlLabel} numberOfLines={1}>
        {label}
      </Text>
      {active && <View style={UI_STYLES.mapCtrlActiveDot} />}
    </TouchableOpacity>
  );
}

const UI_STYLES = StyleSheet.create({
  // ── TOP BAR ────────────────────────────────────────────────────────────────
  topBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 36,
    left: 12,
    right: 12,
    gap: 8,
  },
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 5,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 7,
  },
  searchPrefixIcon: {
    fontSize: T.lead,
    color: "#999",
  },
  searchInput: {
    flex: 1,
    fontSize: T.body,
    color: "#333",
    paddingVertical: 7,
  },
  searchGoBtn: {
    backgroundColor: "#3a6a28",
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchGoBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: T.meta,
    letterSpacing: 0.3,
  },
  searchClearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 2,
  },
  searchClearText: {
    color: "#888",
    fontSize: T.body,
    fontWeight: "700",
  },
  locationBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(42,66,48,0.92)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#5a8a48",
    gap: 5,
  },
  locationBadgeText: {
    color: "#e0f0d0",
    fontSize: T.meta,
    fontWeight: "600",
  },

  // ── DOBA DANA CHIPS ────────────────────────────────────────────────────────
  todRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  todChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.93)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  todChipActive: {
    backgroundColor: "#1a3020",
    borderWidth: 1.5,
    borderColor: "#5a8a48",
  },
  todChipIcon: {
    width: 22,
    height: 22,
  },
  todChipLabel: {
    fontSize: T.meta,
    fontWeight: "700",
    color: "#444",
    letterSpacing: 0.2,
  },
  todChipLabelActive: {
    color: "#c0e0a0",
  },
  filterActiveBadge: {
    backgroundColor: "#3a6a28",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 2,
    borderWidth: 1,
    borderColor: "#5a8a48",
  },
  filterActiveBadgeText: {
    color: "#e0f0d0",
    fontSize: T.caption,
    fontWeight: "700",
  },

  // ── MAP CONTROLS (desno, samo kontrole karte) ─────────────────────────────
  mapCtrlPanel: {
    position: "absolute",
    right: 12,
    top: Platform.OS === "ios" ? 202 : 178,
    width: 64,
    backgroundColor: "rgba(26,46,21,0.94)",
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 3,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: V.borderGreen,
  },
  mapCtrlToggle: {
    position: "absolute",
    right: 12,
    top: Platform.OS === "ios" ? 202 : 178,
    width: 64,
    height: 50,
    backgroundColor: "rgba(26,46,21,0.94)",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: V.borderGreen,
    zIndex: 10,
  },
  mapCtrlToggleChevron: {
    fontSize: T.lead,
    lineHeight: 20,
    color: V.accentGold,
    fontWeight: "700",
  },
  mapCtrlLabel: {
    fontSize: 10.5,
    color: V.silverBright,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  mapCtrlBtn: {
    width: 58,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  mapCtrlBtnActive: {
    backgroundColor: "rgba(110,158,92,0.22)",
    borderColor: V.primary,
  },
  mapCtrlIcon: {
    width: 38,
    height: 38,
    marginBottom: 1,
  },
  mapCtrlDivider: {
    alignSelf: "stretch",
    height: 1,
    backgroundColor: V.borderDim,
    marginHorizontal: 8,
    marginVertical: 3,
  },
  radiusPicker: {
    position: "absolute",
    right: 12 + 64 + 8,
    width: 112,
    padding: 8,
    gap: 6,
    borderRadius: 16,
    backgroundColor: "rgba(26,46,21,0.96)",
    borderWidth: 1,
    borderColor: V.borderGreen,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 9,
  },
  radiusPickerTitle: {
    color: V.silverDim,
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  radiusChip: {
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: V.forestMid,
    borderWidth: 1,
    borderColor: V.borderDim,
  },
  radiusChipOn: { backgroundColor: V.primary, borderColor: V.primary },
  radiusChipTxt: { color: V.silverBright, fontSize: T.meta, fontWeight: "700" },
  radiusChipTxtOn: { color: V.onPrimary },
  radiusHide: { paddingVertical: 6, alignItems: "center" },
  radiusHideTxt: { color: V.silverDim, fontSize: 12, fontWeight: "600" },
  mapCtrlActiveDot: {
    position: "absolute",
    top: 3,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: V.accentGold,
    borderWidth: 1.5,
    borderColor: V.forestDeep,
  },

  // ── INFO BAR (loading / broj rezultata) ───────────────────────────────────
  infoBar: {
    position: "absolute",
    bottom: 70,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20,40,20,0.86)",
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 18,
    gap: 10,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(90,138,72,0.4)",
  },
  infoBarText: {
    color: "#d0e8c0",
    fontSize: T.meta,
    fontWeight: "600",
    flex: 1,
  },
  infoShowMoreBtn: {
    backgroundColor: "#3a6a28",
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#5a8a48",
  },
  infoShowMoreText: {
    color: "#e0f0d0",
    fontSize: T.meta,
    fontWeight: "700",
  },

  // ── BOTTOM NAVIGATION BAR ─────────────────────────────────────────────────
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#131f14",
    borderTopWidth: 1.5,
    borderTopColor: "#3a5a30",
    flexDirection: "row",
    paddingBottom: Platform.OS === "ios" ? 26 : 10,
    paddingTop: 10,
    paddingHorizontal: 0,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
    minHeight: 44,
  },
  navIconWrap: {
    position: "relative",
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  navIcon: {
    width: 26,
    height: 26,
  },
  navLabel: {
    fontSize: 9,
    color: "#7a9a70",
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.1,
  },
  navLabelActive: {
    color: "#a0d080",
    fontWeight: "700",
  },
  navBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#cc3830",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#131f14",
    paddingHorizontal: 3,
  },
  navBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },

  // Filteri gumb u bottom nav — ima poseban stil kad je aktivan
  navFilterBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
    minHeight: 44,
  },
  navFilterIconWrap: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  navFilterBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#3a6a28",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#131f14",
    paddingHorizontal: 3,
  },
  navFilterBadgeText: {
    color: "#d0f0a0",
    fontSize: 9,
    fontWeight: "800",
  },
});

const BADGE_T = [10, 20, 30, 40, 50];
/**
 * Naziv titule za kategoriju i razinu, npr. "Planinar III".
 *
 * Prije je ovdje stajala tablica s upisanim hrvatskim nazivima, i to samo
 * za pet od osamnaest kategorija. Planine, plaže, muzeji i ostalih trinaest
 * dobivali su općenito "značka 3. razine" umjesto titule — a korisnik na
 * njemačkom je za deset kafića dobivao "Kafomanijak III".
 *
 * Sada se sprema samo osnovni naziv po kategoriji (badges.titles.<id>), a
 * razina se dopisuje kao rimski broj. Time je 19 kategorija x 5 razina x 5
 * jezika svedeno s 475 nizova na 95, i nova kategorija traži jedan redak po
 * jeziku umjesto pet.
 */
const BADGE_LEVEL_NUMERALS = ["I", "II", "III", "IV", "V"] as const;

function badgeTitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  category: string,
  level: number,
): string {
  const base = t(`badges.titles.${category}`, { defaultValue: "" });
  const tier = BADGE_T.indexOf(level);
  const numeral = tier >= 0 ? BADGE_LEVEL_NUMERALS[tier] : "";
  // Kategorija bez naziva (nova, još neprevedena) ne smije dati prazan
  // natpis — tada se vraća opisna zamjena.
  if (!base) return t("badges.badge", { level });
  return numeral ? `${base} ${numeral}` : base;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
const loadJSON = async <T,>(key: string, def: T) => {
  try {
    const r = await AsyncStorage.getItem(key);
    return r ? JSON.parse(r) : def;
  } catch {
    return def;
  }
};
const saveJSON = async (key: string, val: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// ─── Google Places Details ────────────────────────────────────────────────────
interface PlaceDetails {
  photos: string[];
  openingHours: string | null;
  rating?: number;
  phone?: string;
}
async function fetchGoogleDetails(
  name: string,
  lat: number,
  lng: number,
): Promise<PlaceDetails | null> {
  if (!GOOGLE_KEY) return null;
  const { place } = await findPlaceNew({
    key: GOOGLE_KEY,
    name,
    latitude: lat,
    longitude: lng,
  });
  if (!place) return null;

  let openingHours: string | null = null;
  if (place.openingHours) openingHours = place.openingHours;
  else if (place.openNow !== null)
    openingHours = place.openNow ? "__OPEN__" : "__CLOSED__";

  return {
    photos: place.photoNames
      .slice(0, 3)
      .map((n) => placePhotoUrl(n, GOOGLE_KEY)),
    openingHours,
    rating: place.rating,
    phone: place.phone,
  };
}

// ─── Backend: visits ─────────────────────────────────────────────────────────
async function backendAddVisit(v: VisitRecord) {
  try {
    const t = await getToken();
    if (!t) return false;
    const r = await fetch(`${API_BASE_URL}/api/visits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify(v),
    });
    return r.ok;
  } catch {
    return false;
  }
}
async function backendGetVisits(): Promise<VisitRecord[]> {
  try {
    const t = await getToken();
    if (!t) return [];
    const r = await fetch(`${API_BASE_URL}/api/visits`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    // Tiho ignorira network grešku — vraća prazan niz
    return [];
  }
}
async function backendDeleteVisit(id: string) {
  try {
    const t = await getToken();
    if (!t) return false;
    const r = await fetch(`${API_BASE_URL}/api/visits/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

function fmtTime(startMin: number, durMin: number) {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  return `${fmt(startMin)}–${fmt(startMin + durMin)}`;
}

// ─── Generiraj 5 ruta A–E ─────────────────────────────────────────────────────
function generateDayRoutes(venues: Record<string, VenueItem[]>): DayRoute[] {
  // Tipični redoslijed aktivnosti kroz dan
  const STOP_SEQUENCE = [
    "cafe", // Doručak / jutarnja kava
    "landmark", // Razgledavanje
    "park", // Šetnja
    "restaurant", // Ručak
    "museum", // Poslijepodnevna aktivnost
    "beach", // Plaža / opuštanje
    "cafe", // Poslijepodnevna kava (drugi indeks)
    "restaurant", // Večera
    "club", // Noćni izlazak
  ];

  const catKeys = Object.keys(venues).filter((k) => venues[k].length > 0);

  const routes: DayRoute[] = [];
  for (let r = 0; r < 5; r++) {
    const stops: DayRoute["stops"] = [];

    for (let si = 0; si < STOP_SEQUENCE.length; si++) {
      const type = STOP_SEQUENCE[si];
      const list = venues[type];
      if (!list || list.length === 0) continue;
      // Svaka ruta uzima drugačiji item po modulo indeksu
      const item = list[(r + si) % list.length];
      stops.push({ venue: item, type, order: stops.length + 1 });
    }

    // Fallback: ako ima premalo standardnih, dodaj ostale kategorije
    if (stops.length < 3) {
      catKeys.forEach((type) => {
        if (stops.length >= 6) return;
        const list = venues[type];
        const item = list[r % list.length];
        if (!stops.find((s) => s.venue.name === item.name)) {
          stops.push({ venue: item, type, order: stops.length + 1 });
        }
      });
    }

    // Reassign order
    stops.forEach((s, i) => (s.order = i + 1));

    routes.push({
      label: ROUTE_LABELS[r],
      color: ROUTE_COLORS[r],
      stops,
      coordinates: stops.map((s) => ({
        latitude: s.venue.latitude,
        longitude: s.venue.longitude,
      })),
    });
  }
  return routes.filter((r) => r.stops.length > 0);
}

function buildSmartSchedule(
  route: DayRoute,
  companions: CompanionType,
  preference: PreferenceType,
): { time: string; type: string; venue: VenueItem }[] {
  const schedule: { time: string; type: string; venue: VenueItem }[] = [];
  let cursor = 8 * 60; // 08:00

  for (const stop of route.stops) {
    const dur = ACTIVITY_DURATION[stop.type] ?? 60;
    schedule.push({
      time: fmtTime(cursor, dur),
      type: stop.type,
      venue: stop.venue,
    });
    cursor += dur + TRAVEL_MIN;
  }
  return schedule;
}

// ─── badge helpers ────────────────────────────────────────────────────────────
async function checkBadges(
  placeType: string,
  visits: VisitRecord[],
): Promise<Badge[]> {
  const badges = await loadJSON<Badge[]>(STORAGE_BADGES, []);
  const count = visits.filter((v) => v.placeType === placeType).length;
  const newB: Badge[] = [];
  for (const t of BADGE_T) {
    if (
      count >= t &&
      !badges.find((b: Badge) => b.category === placeType && b.level === t)
    ) {
      const nb = {
        category: placeType,
        level: t,
        earnedAt: new Date().toISOString(),
      };
      badges.push(nb);
      newB.push(nb);
    }
  }
  if (newB.length) await saveJSON(STORAGE_BADGES, badges);
  return newB;
}

// MARKER COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function UserLocationMarker() {
  const pulse = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true); // tek kad je mountiran
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const outerOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0.1],
  });
  const outerScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.8],
  });

  return (
    <View
      style={{
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Pulsirajući vanjski krug */}
      <Animated.View
        style={{
          position: "absolute",
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#007AFF",
          opacity: outerOpacity,
          transform: [{ scale: outerScale }],
        }}
      />
      {/* Bijeli rub */}
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: "#fff",
          justifyContent: "center",
          alignItems: "center",
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 3,
        }}
      >
        {/* Plava unutarnja točka */}
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#007AFF",
          }}
        />
      </View>
    </View>
  );
}

// const ms = StyleSheet.create({
//   circle: {
//     width: 46,
//     height: 46,
//     borderRadius: 23,
//     justifyContent: "center",
//     alignItems: "center",
//     borderWidth: 3,
//     borderColor: "#fff",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 3 },
//     shadowOpacity: 0.4,
//     shadowRadius: 4,
//     elevation: 7,
//   },
//   emoji: { fontSize: T.screen },
//   pin: {
//     width: 5,
//     height: 12,
//     borderBottomLeftRadius: 5,
//     borderBottomRightRadius: 5,
//     marginTop: -2,
//   },
// });

function PlaceMarker({
  place,
  onPress,
  isVisited = false,
}: {
  place: Place;
  onPress: () => void;
  isVisited?: boolean;
}) {
  const cat = placeCategories[place.type as keyof typeof placeCategories];
  const color = cat?.color || V.silverDim;
  // Marker se na Androidu crta kao slika. Dok je "tracksViewChanges" uključen,
  // ta se slika neprestano iznova snima — a posjećeni marker je imao beskonačnu
  // animaciju pulsiranja, pa je svaki posjećeni marker trajno uključivao to
  // snimanje. S desetak posjećenih mjesta (arhiva posjeta ih prikaže sva)
  // karta bi se zagušila i ostala prazna, samo zelena pozadina. Zato se sada
  // marker snimi jednom (kratko praćenje dok se slika učita), a posjećeni se
  // razlikuje statičnim zelenim prstenom i kvačicom.
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const id = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(id);
  }, [isVisited, place.type]);

  const iconSource = CATEGORY_ICONS[place.type];

  return (
    <Marker
      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
      onPress={onPress}
      tracksViewChanges={tracking}
    >
      <View style={{ alignItems: "center", width: 60, height: 74 }}>
        {isVisited && (
          <View
            style={{
              position: "absolute",
              top: 0,
              width: 54,
              height: 54,
              borderRadius: 27,
              borderWidth: 3,
              borderColor: "#34c759",
              opacity: 0.9,
            }}
          />
        )}
        {iconSource ? (
          <ImageBackground
            source={iconSource}
            style={{
              width: 50,
              height: 50,
              justifyContent: "center",
              alignItems: "center",
            }}
            imageStyle={{
              width: 50,
              height: 50,
              borderRadius: 25,
              borderWidth: 2.5,
              borderColor: "#fff",
            }}
            resizeMode="contain"
            fadeDuration={0}
          >
            <View
              style={{
                position: "absolute",
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: color,
                opacity: 0.25,
              }}
            />
          </ImageBackground>
        ) : (
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: color,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 2.5,
              borderColor: "#fff",
            }}
          >
            <Text style={{ fontSize: T.screen }}>
              {EMOJIS[place.type] || "📍"}
            </Text>
          </View>
        )}
        {isVisited && (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: 2,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: "#34c759",
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 2,
              borderColor: "#fff",
              elevation: 8,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
              ✓
            </Text>
          </View>
        )}
        <View
          style={{
            width: 5,
            height: 12,
            backgroundColor: color,
            borderBottomLeftRadius: 5,
            borderBottomRightRadius: 5,
            marginTop: -2,
          }}
        />
      </View>
    </Marker>
  );
}

function PlaceMarkerPlan({
  venue,
  type,
  order,
  color,
  onPress,
  isVisited,
}: {
  venue: VenueItem;
  type: string;
  order: number;
  color: string;
  onPress: () => void;
  isVisited: boolean;
}) {
  const icon = CATEGORY_ICONS[type];
  return (
    <Marker
      coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={{ alignItems: "center", width: 56, height: 70 }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: isVisited ? "#34c75922" : color + "22",
            borderWidth: 2.5,
            borderColor: isVisited ? "#34c759" : color,
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          {icon ? (
            <Image
              source={icon}
              style={{ width: 32, height: 32 }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ fontSize: T.title }}>{EMOJIS[type] || "📍"}</Text>
          )}
        </View>
        <View
          style={{
            position: "absolute",
            top: -4,
            right: -2,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: isVisited ? "#34c759" : color,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: "#fff",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
            {order}
          </Text>
        </View>
        <View
          style={{
            width: 4,
            height: 10,
            backgroundColor: isVisited ? "#34c759" : color,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            marginTop: -2,
          }}
        />
      </View>
    </Marker>
  );
}

// PLACE DETAIL MODAL
// ══════════════════════════════════════════════════════════════════════════════

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity
          key={s}
          onPress={() => onChange(s)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          {/* Prazna zvjezdica je šuplja (☆), ne samo blijeda: neocijenjeno
              mjesto inače izgleda kao da već ima pet zvjezdica. */}
          <Text style={[dm.star, s <= value ? dm.starOn : dm.starOff]}>
            {s <= value ? "★" : "☆"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PlaceDetailModal({
  place,
  visible,
  onClose,
  onMarkVisited,
  onHidePlace,
  isVisited,
  notifPrefs,
  onToggleNotif,
}: {
  place: Place | null;
  visible: boolean;
  onClose: () => void;
  onMarkVisited: (p: Place) => void;
  onHidePlace: (id: string) => void;
  isVisited: boolean;
  notifPrefs: NotifPrefs;
  onToggleNotif: (catId: string) => void;
}) {
  const { t } = useTranslation();
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [wantReturn, setWantReturn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);
  /**
   * Tipkovnica preko lista.
   *
   * List je pri dnu ekrana i ne miče se kad se tipkovnica otvori — a unutar
   * <Modal>-a na Androidu KeyboardAvoidingView nema na što djelovati (modal
   * je zaseban prozor bez adjustResize). Zato se visina tipkovnice mjeri i
   * list se za toliko skrati, a sadržaj dobije razmak pri dnu da se polje
   * za unos može podići iznad nje.
   */
  const keyboardHeight = useKeyboardHeight();
  const inputOffset = useInputBottomOffset();
  /**
   * Prijava netočnog podatka o mjestu.
   *
   * Podaci o mjestima dolaze iz OpenStreetMapa i znaju biti zastarjeli —
   * kafić se zatvorio, adresa je kriva, kategorija promašena. Dosad je to
   * korisnik mogao samo prešutjeti. Prijava ide u isti popis koji admin
   * već čita (/api/support/report), pa nije trebalo ništa novo na
   * poslužitelju.
   */
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  const sendPlaceReport = async () => {
    if (!place || !reportText.trim()) return;
    setSendingReport(true);
    try {
      const token = await getToken();
      const [firstName, lastName, username] = await Promise.all([
        AsyncStorage.getItem("firstName"),
        AsyncStorage.getItem("lastName"),
        AsyncStorage.getItem("username"),
      ]);

      // O kojem se mjestu radi ide u samu poruku: admin tako vidi sve u
      // jednom polju, bez nove tablice i bez migracije.
      const context =
        `${place.name}\n` +
        `${t(`categories.${place.type}`, { defaultValue: place.type })}\n` +
        `${place.address ?? ""}\n` +
        `${place.latitude}, ${place.longitude}\n` +
        `OSM id: ${place.id}`;

      const res = await fetch(`${API_BASE_URL}/api/support/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: "place",
          message: `${context}\n\n---\n${reportText.trim()}`,
          userName: `${firstName ?? ""} ${lastName ?? ""}`.trim(),
          userUsername: username ?? "",
        }),
      });

      if (!res.ok) throw new Error();
      setReportText("");
      setReportOpen(false);
      Alert.alert(t("map.reportSentTitle"), t("map.reportSentBody"));
    } catch {
      Alert.alert(t("common.error"), t("map.reportFailed"));
    } finally {
      setSendingReport(false);
    }
  };

  useEffect(() => {
    if (!place || !visible) {
      setDetails(null);
      setPhotoIdx(0);
      setStars(0);
      setComment("");
      setWantReturn(false);
      setSaved(false);
      return;
    }
    setLoading(true);
    fetchGoogleDetails(place.name, place.latitude, place.longitude).then(
      (d) => {
        setDetails(d);
        setLoading(false);
      },
    );
    loadJSON<PlaceReview[]>(STORAGE_REVIEWS, []).then((reviews) => {
      const r = reviews.find((x: PlaceReview) => x.placeId === place.id);
      if (r) {
        setStars(r.stars);
        setComment(r.comment);
        setWantReturn(r.wantToReturn);
        setSaved(true);
      }
    });
  }, [place, visible]);

  if (!place) return null;
  const cat = placeCategories[place.type as keyof typeof placeCategories];
  const color = cat?.color || V.silverDim;
  const emoji = EMOJIS[place.type] || "📍";
  const photos = details?.photos || [];
  const isNotified = notifPrefs.categories.includes(place.type);

  const handleSave = async () => {
    if (stars === 0) {
      Alert.alert(t("map.noReview"), t("map.ratingRequired"));
      return;
    }
    setSaving(true);
    const reviews = await loadJSON<PlaceReview[]>(STORAGE_REVIEWS, []);
    const idx = reviews.findIndex((x: PlaceReview) => x.placeId === place.id);
    const rev = {
      placeId: place.id,
      stars,
      comment: comment.trim(),
      wantToReturn: wantReturn,
      reviewedAt: new Date().toISOString(),
    };
    if (idx >= 0) reviews[idx] = rev;
    else reviews.push(rev);
    await saveJSON(STORAGE_REVIEWS, reviews);
    setSaving(false);
    setSaved(true);
    Alert.alert("✅", t("map.reviewSaved"));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // FIX: na Androidu je ovdje stajao behavior="height". Aplikacija radi u
        // edge-to-edge načinu i sustav sam smanjuje prozor kad se otvori tipkovnica,
        // pa je KeyboardAvoidingView smanjivao visinu JOŠ JEDNOM. Dvije se prilagodbe
        // natežu oko visine ekrana kroz cijelu animaciju tipkovnice, što se vidi kao
        // neprekidno treperenje/vibriranje cijelog ekrana. Na Androidu zato nema
        // behaviora — sustav to odradi sam. (Unutar <Modal>-a KeyboardAvoidingView
        // ionako ne radi jer je modal zaseban prozor bez adjustResize; ondje se
        // koristi useInputBottomOffset iz hooks/use-keyboard-offset.)
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={dm.overlay}>
          <View
            style={[
              dm.sheet,
              keyboardHeight > 0 && {
                // Isti postotak kao u dm.sheet, samo umanjen za tipkovnicu.
                maxHeight: SH * 0.92 - keyboardHeight,
              },
            ]}
          >
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: inputOffset }}
            >
              <View style={dm.grabber} />
              <View style={dm.imageBox}>
                {loading ? (
                  <View style={[dm.imgPh, { backgroundColor: color + "22" }]}>
                    <ActivityIndicator color={color} size="large" />
                    <Text
                      style={{
                        color: V.silverDim,
                        marginTop: 8,
                        fontSize: T.meta,
                      }}
                    >
                      {t("common.loading")}
                    </Text>
                  </View>
                ) : photos[photoIdx] ? (
                  <Image
                    source={{ uri: photos[photoIdx] }}
                    style={dm.img}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[dm.imgPh, { backgroundColor: color + "22" }]}>
                    <Text style={{ fontSize: 72 }}>{emoji}</Text>
                  </View>
                )}
                {photos.length > 1 && (
                  <View style={dm.dots}>
                    {photos.map((_, i) => (
                      <TouchableOpacity key={i} onPress={() => setPhotoIdx(i)}>
                        <View style={[dm.dot, i === photoIdx && dm.dotA]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TouchableOpacity
                  style={dm.closeBtn}
                  onPress={onClose}
                  hitSlop={TAP_SLOP}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: T.body,
                      fontWeight: "700",
                    }}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
                {/* <TouchableOpacity
                  style={dm.hideBtn}
                  onPress={() =>
                    Alert.alert(
                      t("map.hidePlace"),
                      t("map.hidePlaceConfirm", { name: place.name }),
                      [
                        { text: t("common.cancel"), style: "cancel" },
                        {
                          text: "Ukloni ",
                          style: "destructive",
                          onPress: () => {
                            onHidePlace(place.id);
                            onClose();
                          },
                        },
                      ],
                    )
                  }
                >
                  <Text style={{ fontSize: T.title }}></Text>
                </TouchableOpacity> */}
              </View>

              <View style={dm.body}>
                <View
                  style={[
                    dm.badge,
                    {
                      backgroundColor: color + "26",
                      borderColor: color + "77",
                    },
                  ]}
                >
                  <Text style={[dm.badgeTxt, { color }]}>
                    {emoji}{" "}
                    {t(`categories.${place.type}`, {
                      defaultValue: place.type,
                    })}
                  </Text>
                </View>
                <Text style={dm.name}>{place.name}</Text>
                {place.address ? (
                  <Text style={dm.meta}>📍 {place.address}</Text>
                ) : null}
                {place.distance !== undefined ? (
                  <Text style={dm.meta}>
                    📏 {t("map.distance", { dist: place.distance.toFixed(2) })}
                  </Text>
                ) : null}
                {details?.rating || place.rating ? (
                  <Text style={dm.rating}>
                    ⭐ {(details?.rating || place.rating)?.toFixed(1)} / 5
                  </Text>
                ) : null}
                {details?.phone ? (
                  <Text style={dm.meta}>📞 {details.phone}</Text>
                ) : null}

                <View style={dm.hoursBox}>
                  <Text style={dm.hoursTitle}>🕐 {t("map.openingHours")}</Text>
                  {loading ? (
                    <ActivityIndicator size="small" color={color} />
                  ) : details?.openingHours ? (
                    <>
                      {(() => {
                        // Stanje se računa iz zapisanog radnog vremena; ako se
                        // ne može utvrditi, oznake naprosto nema.
                        const raw = details.openingHours;
                        const state =
                          raw === "__OPEN__"
                            ? true
                            : raw === "__CLOSED__"
                              ? false
                              : isOpenAt(raw, new Date());
                        if (state === null) return null;
                        const tint = state ? "#3FBF6F" : "#D9534F";
                        return (
                          <View
                            style={[
                              dm.openBadge,
                              {
                                borderColor: tint,
                                backgroundColor: state
                                  ? "rgba(63,191,111,0.12)"
                                  : "rgba(217,83,79,0.12)",
                              },
                            ]}
                          >
                            <View
                              style={[
                                dm.openBadgeDot,
                                { backgroundColor: tint },
                              ]}
                            />
                            <Text style={[dm.openBadgeText, { color: tint }]}>
                              {state ? t("map.openNow") : t("map.closedNow")}
                            </Text>
                          </View>
                        );
                      })()}
                      {details.openingHours !== "__OPEN__" &&
                      details.openingHours !== "__CLOSED__" ? (
                        <Text style={dm.hoursText}>{details.openingHours}</Text>
                      ) : null}
                    </>
                  ) : null}
                </View>

                <View style={dm.notifRow}>
                  <Text style={dm.notifLabel}>
                    🔔{" "}
                    {t("map.notifications", {
                      category: t(`categories.${place.type}`, {
                        defaultValue: place.type,
                      }),
                    })}
                  </Text>
                  <Switch
                    value={isNotified}
                    onValueChange={(v) => {
                      if (v) {
                        Alert.alert(
                          t("notif.unavailableTitle"),
                          t("notif.unavailableApp"),
                        );
                        return;
                      }
                      onToggleNotif(place.type);
                    }}
                    trackColor={{ true: V.visited, false: V.borderDim }}
                    thumbColor={isNotified ? V.silverBright : V.silverDim}
                  />
                </View>

                <View style={dm.reviewBox}>
                  <Text style={dm.reviewTitle}>✍️ {t("map.noReview")}</Text>
                  <StarRating value={stars} onChange={setStars} />
                  <TextInput
                    ref={commentInputRef}
                    style={dm.commentInput}
                    placeholder={t("map.commentPlaceholder")}
                    placeholderTextColor={V.silverDim}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    maxLength={300}
                    onFocus={() => {
                      // Scroll dolje kad se tipkovnica otvori
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 350);
                    }}
                  />
                  <TouchableOpacity
                    style={[dm.returnToggle, wantReturn && dm.returnA]}
                    onPress={() => setWantReturn((v) => !v)}
                  >
                    <Text
                      style={[
                        dm.returnTxt,
                        wantReturn && { color: V.silverBright },
                      ]}
                    >
                      {wantReturn ? "☑  " : "☐  "}
                      {t("map.wantToReturn")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={dm.reviewBtn}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={dm.reviewBtnTxt}>
                        {saved ? t("map.updateReview") : t("map.saveReview")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Prijava netočnog podatka otvara vlastiti prozor.
                    Umetnuti obrazac unutar ovog lista značio je listanje do
                    polja, a tipkovnica bi ga svejedno prekrila — list je pri
                    dnu ekrana i nema se kamo podići. */}
                <TouchableOpacity
                  style={dm.reportBtn}
                  onPress={() => setReportOpen(true)}
                >
                  <Text style={dm.reportBtnTxt}>⚠️ {t("map.reportWrong")}</Text>
                </TouchableOpacity>

                {!isVisited ? (
                  <TouchableOpacity
                    style={dm.visitBtn}
                    onPress={() => {
                      onMarkVisited(place);
                      onClose();
                    }}
                  >
                    <Text style={dm.visitBtnTxt}>
                      ✅ {t("map.markVisited")}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={dm.visitedBadge}>
                    <Text
                      style={{
                        color: V.visited,
                        fontWeight: "700",
                        fontSize: T.body,
                      }}
                    >
                      ✓ {t("map.visited")}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Prijava netočnog podatka — vlastiti, mali prozor.
          Sadrži samo naslov, polje i dva gumba, pa nema što listati. Sjeda
          točno iznad tipkovnice (paddingBottom = njezina visina), umjesto da
          se pokušava izboriti za prostor unutar lista s podacima o mjestu. */}
      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportOpen(false)}
      >
        <View style={[dm.reportOverlay, { paddingBottom: inputOffset }]}>
          <View style={dm.reportDialog}>
            <Text style={dm.reportTitle}>{t("map.reportWrong")}</Text>
            <Text style={dm.reportPlace} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={dm.reportHint}>{t("map.reportHint")}</Text>

            <TextInput
              style={dm.reportInput}
              placeholder={t("map.reportPlaceholder")}
              placeholderTextColor={V.silverDim}
              value={reportText}
              onChangeText={setReportText}
              multiline
              maxLength={600}
              autoFocus
            />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[dm.reportAction, { borderColor: V.silverDim }]}
                onPress={() => {
                  setReportOpen(false);
                  setReportText("");
                }}
              >
                <Text style={{ color: V.silverDim, fontWeight: "700" }}>
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  dm.reportAction,
                  {
                    backgroundColor: reportText.trim()
                      ? V.visited
                      : V.borderDim,
                    borderColor: "transparent",
                    flex: 1,
                  },
                ]}
                onPress={sendPlaceReport}
                disabled={!reportText.trim() || sendingReport}
              >
                {sendingReport ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    {t("map.reportSend")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// const dm = StyleSheet.create({
//   overlay: {
//     flex: 1,
//     backgroundColor: "rgba(0,0,0,0.55)",
//     justifyContent: "flex-end",
//   },
//   sheet: {
//     backgroundColor: "#fff",
//     borderTopLeftRadius: 24,
//     borderTopRightRadius: 24,
//     maxHeight: SH * 0.92,
//   },
//   imageBox: { position: "relative" },
//   imgPh: {
//     width: "100%",
//     height: 200,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   img: { width: "100%", height: 220 },
//   dots: {
//     position: "absolute",
//     bottom: 10,
//     left: 0,
//     right: 0,
//     flexDirection: "row",
//     justifyContent: "center",
//     gap: 6,
//   },
//   dot: {
//     width: 7,
//     height: 7,
//     borderRadius: 4,
//     backgroundColor: "rgba(255,255,255,0.5)",
//   },
//   dotA: { backgroundColor: "#fff" },
//   closeBtn: {
//     position: "absolute",
//     top: 12,
//     right: 12,
//     backgroundColor: "rgba(0,0,0,0.5)",
//     width: 34,
//     height: 34,
//     borderRadius: 17,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   hideBtn: {
//     position: "absolute",
//     top: 12,
//     left: 12,
//     backgroundColor: "rgba(0,0,0,0.5)",
//     width: 34,
//     height: 34,
//     borderRadius: 17,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   body: { padding: 20, paddingBottom: 36 },
//   badge: {
//     alignSelf: "flex-start",
//     paddingHorizontal: 12,
//     paddingVertical: 5,
//     borderRadius: 20,
//     marginBottom: 10,
//   },
//   badgeTxt: { color: "#fff", fontSize: T.meta, fontWeight: "700" },
//   name: { fontSize: T.screen, fontWeight: "800", color: "#1a1a1a", marginBottom: 6 },
//   meta: { fontSize: T.body, color: "#666", marginBottom: 4 },
//   rating: { fontSize: T.body, color: "#ff9500", marginBottom: 8 },
//   hoursBox: {
//     backgroundColor: "#f5f5f5",
//     borderRadius: 12,
//     padding: 14,
//     marginVertical: 12,
//   },
//   hoursTitle: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: "#333",
//     marginBottom: 6,
//   },
//   hoursText: { fontSize: T.meta, color: "#555", lineHeight: 20 },
//   notifRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     backgroundColor: "#f0f0ff",
//     borderRadius: 12,
//     padding: 14,
//     marginBottom: 12,
//   },
//   notifLabel: { fontSize: T.body, color: "#333", fontWeight: "600", flex: 1 },
//   reviewBox: {
//     backgroundColor: "#fafafa",
//     borderRadius: 14,
//     padding: 16,
//     marginBottom: 16,
//     gap: 12,
//   },
//   reviewTitle: { fontSize: T.body, fontWeight: "700", color: "#333" },
//   commentInput: {
//     backgroundColor: "#fff",
//     borderWidth: 1,
//     borderColor: "#e0e0e0",
//     borderRadius: 10,
//     padding: 12,
//     fontSize: T.body,
//     color: "#333",
//     minHeight: 80,
//     textAlignVertical: "top",
//   },
//   returnToggle: {
//     borderRadius: 10,
//     paddingVertical: 10,
//     paddingHorizontal: 14,
//     backgroundColor: "#f0f0f0",
//     alignSelf: "flex-start",
//   },
//   returnA: { backgroundColor: "#e8f5e9" },
//   returnTxt: { fontSize: T.body, color: "#333", fontWeight: "600" },
//   reviewBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
//   reviewBtnTxt: { color: "#fff", fontWeight: "700", fontSize: T.body },
//   visitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
//   visitBtnTxt: { color: "#fff", fontSize: T.lead, fontWeight: "700" },
//   visitedBadge: {
//     backgroundColor: "#e8f5e9",
//     borderRadius: 14,
//     paddingVertical: 12,
//     alignItems: "center",
//     borderWidth: 1.5,
//     borderColor: "#34c759",
//   },
// });

// ─── Notification Settings Modal ──────────────────────────────────────────────
function NotificationSettingsModal({
  visible,
  prefs,
  onClose,
  onSave,
}: {
  visible: boolean;
  prefs: NotifPrefs;
  onClose: () => void;
  onSave: (p: NotifPrefs) => void;
  getAllCategories: () => {
    id: string;
    name: string;
    icon: string;
    color: string;
  }[];
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDashColors(isDark);
  const getAllCategories = useCallback(() => {
    // Uključuje i "Ostalo" — objava koja ne pripada nijednoj kategoriji ipak
    // mora imati nekoga tko je prati, inače nikad ne stigne ni do koga.
    return POST_CATEGORY_IDS.map((id) => ({
      id,
      name: t(`categories.${id}`, { defaultValue: id }),
      icon: EMOJIS[id] || "📍",
      // "Ostalo" nema unos u placeCategories (nije vrsta mjesta), pa uzima
      // neutralnu boju.
      color: placeCategories[id]?.color ?? "#7A8A75",
    }));
  }, [t]);
  const [p, setP] = useState<NotifPrefs>(prefs);
  useEffect(() => {
    setP(prefs);
  }, [visible, prefs]);
  const notifDirty =
    JSON.stringify({
      ...p,
      categories: [...p.categories].sort(),
      ageGroups: [...(p.ageGroups ?? [])].sort(),
    }) !==
    JSON.stringify({
      ...prefs,
      categories: [...prefs.categories].sort(),
      ageGroups: [...(prefs.ageGroups ?? [])].sort(),
    });

  const toggle = (cat: string) =>
    setP((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));

  const AGE_GROUPS_DISPLAY = [
    {
      id: "minors",
      label: t("ageGroups.minors"),
      icon: maloletnikIcon,
      desc: "< 18",
      cats: ["park", "cinema", "beach", "museum", "escapeRoom"],
      color: "#3498DB",
    },
    {
      id: "youth",
      label: t("ageGroups.youth"),
      icon: mladiIcon,
      desc: "18–25",
      cats: [
        "club",
        "cinema",
        "beach",
        "escapeRoom",
        "paintball",
        "park",
        "cafe",
      ],
      color: "#9B59B6",
    },
    {
      id: "students",
      label: t("ageGroups.students"),
      icon: studentIcon,
      desc: t("ageGroups.studentDesc"),
      cats: [
        "cafe",
        "cinema",
        "museum",
        "theater",
        "park",
        "escapeRoom",
        "restaurant",
      ],
      color: V.visited,
    },
    {
      id: "adults",
      label: t("ageGroups.adults"),
      icon: odrasliIcon,
      desc: "26–60",
      cats: [
        "restaurant",
        "cafe",
        "spa",
        "theater",
        "museum",
        "landmark",
        "market",
        "accommodation",
      ],
      color: "#E67E22",
    },
    {
      id: "retired",
      label: t("ageGroups.retired"),
      icon: umirovljenikIcon,
      desc: "60+",
      cats: [
        "restaurant",
        "cafe",
        "spa",
        "museum",
        "landmark",
        "park",
        "market",
      ],
      color: "#27AE60",
    },
  ];

  const toggleAgeGroup = (grpId: string) => {
    const grp = AGE_GROUPS_DISPLAY.find((g) => g.id === grpId);
    if (!grp) return;
    setP((prev) => {
      const currentAgeGroups = prev.ageGroups || [];
      const isActive = currentAgeGroups.includes(grpId);
      const newAgeGroups = isActive
        ? currentAgeGroups.filter((x) => x !== grpId)
        : [...currentAgeGroups, grpId];

      const newCategories = isActive
        ? prev.categories.filter((c) => !grp.cats.includes(c))
        : [...new Set([...prev.categories, ...grp.cats])];

      return { ...prev, ageGroups: newAgeGroups, categories: newCategories };
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: DC.bg }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 20,
            paddingTop: Platform.OS === "ios" ? 54 : 36,
            borderBottomWidth: 1.5,
            borderBottomColor: DC.border,
            backgroundColor: DC.bg,
          }}
        >
          <Text
            style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
          >
            {t("map.notifSettings")}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text
              style={{ fontSize: T.body, color: DC.textDim, fontWeight: "600" }}
            >
              {t("common.close")}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 110 }}
          style={{ backgroundColor: DC.bg }}
        >
          {/* App notifikacije toggle */}
          <View
            style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: DC.borderDim,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: DC.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: DC.borderDim,
                marginBottom: 10,
              }}
            >
              <Text
                style={{ fontSize: T.body, fontWeight: "700", color: DC.text }}
              >
                {t("map.appNotifications")}
              </Text>
              <Switch
                value={p.appEnabled}
                onValueChange={(v) => {
                  if (v) {
                    Alert.alert(
                      t("notif.unavailableTitle"),
                      t("notif.unavailableAppEmail"),
                    );
                    return;
                  }
                  setP((x) => ({ ...x, appEnabled: v }));
                }}
                trackColor={{ true: "#5a8a48", false: "#3a5a30" }}
                thumbColor={p.appEnabled ? "#34c759" : "#888"}
              />
            </View>

            {/* Email notifikacije toggle */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: DC.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: DC.borderDim,
              }}
            >
              <Text
                style={{ fontSize: T.body, fontWeight: "700", color: DC.text }}
              >
                {t("map.emailNotifications")}
              </Text>
              <Switch
                value={p.emailEnabled}
                onValueChange={(v) => {
                  if (v) {
                    Alert.alert(
                      t("notif.unavailableTitle"),
                      t("notif.unavailableEmail"),
                    );
                    return;
                  }
                  setP((x) => ({ ...x, emailEnabled: v }));
                }}
                trackColor={{ true: "#5a8a48", false: "#3a5a30" }}
                thumbColor={p.emailEnabled ? "#34c759" : "#888"}
              />
            </View>

            {p.emailEnabled && (
              <TextInput
                selectTextOnFocus
                style={{
                  marginTop: 10,
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: T.body,
                  color: DC.text,
                }}
                placeholder={t("auth.emailPlaceholder")}
                placeholderTextColor={DC.textDim}
                value={p.email}
                onChangeText={(v) => setP((x) => ({ ...x, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}

            {/* Svjetske aktivnosti. Zadano uključeno da aplikacija na
                početku ne izgleda prazno; tko ih ne želi, isključi ovdje. */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: DC.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: DC.borderDim,
                marginTop: 10,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text
                  style={{
                    fontSize: T.body,
                    fontWeight: "700",
                    color: DC.text,
                  }}
                >
                  {t("notif.globalActivities")}
                </Text>
                <Text
                  style={{ fontSize: T.meta, color: DC.textDim, marginTop: 2 }}
                >
                  {t("notif.globalActivitiesHint")}
                </Text>
              </View>
              <Switch
                value={p.globalEnabled !== false}
                onValueChange={(v) => setP((x) => ({ ...x, globalEnabled: v }))}
                trackColor={{ true: "#5a8a48", false: "#3a5a30" }}
                thumbColor={p.globalEnabled !== false ? "#34c759" : "#888"}
              />
            </View>
          </View>

          {/* Kategorije — grid s ikonama */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 4,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                }}
              >
                {t("profile.notifications")}
              </Text>
              {p.categories.length > 0 && (
                <TouchableOpacity
                  onPress={() => setP((x) => ({ ...x, categories: [] }))}
                >
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.accent,
                      fontWeight: "600",
                    }}
                  >
                    {t("map.clearAll")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {getAllCategories().map((cat) => {
                const on = p.categories.includes(cat.id);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={{
                      width: CELL_W,
                      height: 130,
                      backgroundColor: on ? cat.color : DC.card,
                      borderRadius: 12,
                      justifyContent: "center",
                      alignItems: "center",
                      paddingHorizontal: 4,
                      paddingVertical: 8,
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? cat.color : DC.borderDim,
                    }}
                    onPress={() => toggle(cat.id)}
                  >
                    <CategoryCoin
                      id={cat.id}
                      fallbackGlyph={cat.icon}
                      size={96}
                      style={{ marginBottom: 4 }}
                    />
                    <Text
                      style={{
                        fontSize: T.caption,
                        fontWeight: "600",
                        color: on ? "#fff" : DC.textSub,
                        textAlign: "center",
                      }}
                      numberOfLines={2}
                    >
                      {cat.name}
                    </Text>
                    {on && (
                      <View
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: "#34c759",
                          justifyContent: "center",
                          alignItems: "center",
                          borderWidth: 1.5,
                          borderColor: "#fff",
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: "900",
                          }}
                        >
                          ✓
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Primjereno za */}
          <View
            style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: DC.borderDim,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                }}
              >
                {t("map.forAgeGroup")}
              </Text>
              {(p.ageGroups || []).length > 0 && (
                <TouchableOpacity
                  onPress={() => setP((prev) => ({ ...prev, ageGroups: [] }))}
                >
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.accent,
                      fontWeight: "600",
                    }}
                  >
                    {t("map.clearAgeFilter")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {AGE_GROUPS_DISPLAY.map((grp) => {
                const active = (p.ageGroups || []).includes(grp.id);
                return (
                  <TouchableOpacity
                    key={grp.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: active ? grp.color : DC.card,
                      borderWidth: 1.5,
                      borderColor: active ? grp.color : DC.borderDim,
                    }}
                    onPress={() => toggleAgeGroup(grp.id)}
                  >
                    <Image
                      source={grp.icon}
                      style={{ width: 60, height: 60 }}
                      resizeMode="contain"
                    />
                    <View>
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: "700",
                          color: active ? "#fff" : DC.text,
                        }}
                      >
                        {grp.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: active ? "rgba(255,255,255,0.75)" : DC.textDim,
                        }}
                      >
                        {grp.desc}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
        {/* Spremi: traka se pojavi kad ima promjena, uvijek uz donji rub */}
        <UnsavedBar
          visible={notifDirty}
          onPress={() => {
            onSave(p);
            onClose();
            Alert.alert(
              t("profile.savedSuccess"),
              t("profile.updateSettingsSuccess"),
            );
          }}
        />
      </View>
    </Modal>
  );
}

export function ActivityGroupsModal({
  visible,
  onClose,
  userLocation,
}: {
  visible: boolean;
  onClose: () => void;
  userLocation: { latitude: number; longitude: number } | null;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDashColors(isDark);

  const ACTIVITY_TEMPLATES = useMemo(
    () => [
      { label: `☕ ${t("categories.cafe")}`, value: "cafe" },
      { label: `🍽️ ${t("categories.restaurant")}`, value: "restaurant" },
      { label: `🎵 ${t("categories.club")}`, value: "club" },
      { label: `🏖️ ${t("categories.beach")}`, value: "beach" },
      { label: `🎬 ${t("categories.cinema")}`, value: "cinema" },
      { label: `🌳 ${t("categories.park")}`, value: "park" },
      { label: `🔐 ${t("categories.escapeRoom")}`, value: "escapeRoom" },
      { label: `🎯 ${t("categories.paintball")}`, value: "paintball" },
      { label: `⛰️ ${t("categories.mountain")}`, value: "mountain" },
      { label: `💧 ${t("categories.spa")}`, value: "spa" },
    ],
    [t],
  );

  const [groups, setGroups] = useState<ActivityGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ActivityGroup | null>(
    null,
  );
  const [myName, setMyName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );
  const [chatMsg, setChatMsg] = useState("");
  // Odmak retka za unos poruke u grupnom chatu iznad tipkovnice (vidi hook).
  const groupChatInputOffset = useInputBottomOffset();
  const flatRef = useRef<FlatList>(null);
  const [showDMCompose, setShowDMCompose] = useState(false);
  const [dmTarget, setDmTarget] = useState<{
    name: string;
    userId: number | null;
  }>({
    name: "",
    userId: null,
  });
  const [dmMessage, setDmMessage] = useState("");
  const [sendingDM, setSendingDM] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>(
    {},
  );
  const [newGroup, setNewGroup] = useState({
    activity: "",
    description: "",
    locationName: "",
    maxPeople: "5",
    category: "cafe",
  });

  const [locationSuggestions, setLocationSuggestions] = useState<
    { name: string; lat: number; lon: number }[]
  >([]);

  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [locationVerified, setLocationVerified] = useState(false);
  const [verifyingLocation, setVerifyingLocation] = useState(false);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (visible) {
      loadGroups();
      loadMyName();
    }
  }, [visible]);

  // Reset inner state when modal closes
  useEffect(() => {
    if (!visible) {
      setSelectedGroup(null);
      setShowCreate(false);
      setChatMsg("");
    }
  }, [visible]);

  const loadMyName = async () => {
    try {
      const token = await getToken();
      if (token) {
        const res = await fetch(`${API_BASE_URL}/api/auth/my-profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const profile = await res.json();
          console.log("MY PROFILE full response:", JSON.stringify(profile));
          const fullName = `${profile.firstName} ${profile.lastName}`.trim();
          setMyName(fullName);

          const avatarField =
            profile.profileImage ||
            profile.avatarUrl ||
            profile.profilePicture ||
            profile.avatar ||
            null;

          // NOVO: podrška i za preset avatare i za URL-ove
          if (avatarField) {
            if (avatarField.startsWith("avatar:")) {
              // Preset avatar (avatar:male / avatar:female)
              console.log("Preset avatar detected:", avatarField);
              setMyAvatar(avatarField);
              setMemberAvatars((prev) => ({
                ...prev,
                [fullName]: avatarField,
              }));
            } else {
              // Pravi URL (postojeća logika)
              console.log("Avatar field value:", avatarField);
              console.log("API_BASE_URL:", API_BASE_URL);

              let normalizedUrl: string;
              if (avatarField.startsWith("http")) {
                normalizedUrl = avatarField;
              } else {
                normalizedUrl = `${API_BASE_URL}${avatarField.startsWith("/") ? "" : "/"}${avatarField}`;
              }

              console.log("Final avatar URL:", normalizedUrl);
              const uid = Date.now();
              const sep = normalizedUrl.includes("?") ? "&" : "?";
              const finalUrl = `${normalizedUrl}${sep}uid=${uid}`;
              setMyAvatar(finalUrl);
              setMemberAvatars((prev) => ({
                ...prev,
                [fullName]: finalUrl,
              }));
            }
          }
          return;
        }
      }
    } catch (error) {
      console.log("Error fetching profile for group name:", error);
    }

    // Fallback na AsyncStorage
    const f = await AsyncStorage.getItem("firstName");
    const l = await AsyncStorage.getItem("lastName");
    setMyName(`${f || ""} ${l || ""}`.trim() || "Korisnik");
  };

  const fetchMemberAvatars = async (members: string[]) => {
    try {
      const token = await getToken();
      if (!token) return;

      // Korak 1: dohvati listu korisnika da dobiješ ID-eve
      const res = await fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const users = await res.json();

      const avatars: Record<string, string> = {};

      for (const member of members) {
        const nameLower = member.toLowerCase().trim();
        const found = users.find((u: any) => {
          const fn = (u.firstname || u.firstName || "").toLowerCase();
          const ln = (u.lastname || u.lastName || "").toLowerCase();
          return `${fn} ${ln}`.trim() === nameLower;
        });

        if (!found) continue;

        // Korak 2: dohvati profil po ID-u za PRAVI avatar
        try {
          const profileRes = await fetch(
            `${API_BASE_URL}/api/auth/users/${found.id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!profileRes.ok) continue;
          const profile = await profileRes.json();

          const rawUrl =
            profile.Avatar ||
            profile.avatar ||
            profile.avatarUrl ||
            profile.profileImage ||
            null;

          if (!rawUrl || rawUrl === "") continue;

          if (rawUrl.startsWith("avatar:")) {
            // Preset avatar — pohrani direktno
            avatars[member] = rawUrl;
            continue;
          }

          const normalizedUrl = rawUrl.startsWith("http")
            ? rawUrl
            : `${API_BASE_URL}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

          const sep = normalizedUrl.includes("?") ? "&" : "?";
          avatars[member] = `${normalizedUrl}${sep}uid=${found.id}`;
        } catch {
          // tiho ignoriraj za pojedinog korisnika
        }
      }

      setMemberAvatars((prev) => ({ ...prev, ...avatars }));
    } catch {
      // tiho ignoriraj
    }
  };

  const loadGroups = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE_URL}/api/activity-groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        console.log("Raw API response:", JSON.stringify(data, null, 2));
        if (Array.isArray(data)) {
          const formattedGroups = data
            .filter((group: any) => group != null)
            .map((group: any) => ({
              id: group.id || group.Id || Math.random().toString(),
              creatorName: group.creatorName || group.CreatorName || "",
              creatorUserId: group.creatorUserId || group.CreatorUserId || null,
              // POPRAVAK: provjeri oba slučaja (camelCase i PascalCase)
              creatorAvatar: group.creatorAvatar || group.CreatorAvatar || "",
              activity: group.activity || group.Activity || "",
              description: group.description || group.Description || "",
              latitude: group.latitude || group.Latitude || 45.815,
              longitude: group.longitude || group.Longitude || 15.9819,
              locationName: group.locationName || group.LocationName || "",
              maxPeople: group.maxPeople || group.MaxPeople || 5,
              members: Array.isArray(group.members)
                ? group.members
                : Array.isArray(group.Members)
                  ? group.Members
                  : [],
              messages: Array.isArray(group.messages) ? group.messages : [],
              createdAt:
                group.createdAt || group.CreatedAt || new Date().toISOString(),
            }));
          setGroups(formattedGroups);

          // Dohvati avatare svih članova svih grupa
          const allMembers = [
            ...new Set(
              formattedGroups.flatMap((g: any) => g.members as string[]),
            ),
          ];
          if (allMembers.length > 0) fetchMemberAvatars(allMembers);
        } else {
          setGroups([]);
        }
      } else {
        setGroups([]);
      }
    } catch (error) {
      console.log("Error loading groups:", error);
      const data = await loadJSON<ActivityGroup[]>(STORAGE_GROUPS, []);
      const active = (Array.isArray(data) ? data : []).filter(
        (g: ActivityGroup) =>
          Date.now() - new Date(g.createdAt).getTime() < 48 * 60 * 60 * 1000,
      );
      setGroups(active);
    }
  };

  // NOVO — dohvat prijedloga lokacija preko OpenStreetMap Nominatim API-ja
  // NOVO — dohvat prijedloga lokacija preko backend autocomplete endpointa
  // (identičan princip kao u videos.tsx / UploadModal, koji radi ispravno)
  const searchLocationSuggestions = async (query: string) => {
    if (query.trim().length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/locationsearch/autocomplete?query=${encodeURIComponent(
          query.trim(),
        )}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      if (!res.ok) {
        console.log("Autocomplete HTTP error", res.status);
        setLocationSuggestions([]);
        setShowLocationSuggestions(false);
        return;
      }
      const data = await res.json();
      // Backend vraća [{ displayName, lat, lon }] — mapiramo u { name, lat, lon }
      // koji ostatak ActivityGroupsModal-a (JSX dropdown, selectLocationSuggestion) već očekuje
      const suggestions = (Array.isArray(data) ? data : [])
        .map((s: any) => ({
          name: s.displayName,
          lat: parseFloat(s.lat),
          lon: parseFloat(s.lon),
        }))
        .filter((s) => s.name);

      setLocationSuggestions(suggestions);
      setShowLocationSuggestions(suggestions.length > 0);
    } catch (e) {
      console.log("Location suggestion error:", e);
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
    }
  };

  // NOVO — debounce da ne šaljemo zahtjev na svaki keystroke
  const handleLocationInputChange = (text: string) => {
    setNewGroup((p) => ({ ...p, locationName: text }));
    setLocationVerified(false); // korisnik je promijenio tekst → poništi kvačicu
    if (locationSearchTimeout.current)
      clearTimeout(locationSearchTimeout.current);
    locationSearchTimeout.current = setTimeout(() => {
      searchLocationSuggestions(text);
    }, 400);
  };

  // NOVO — kad korisnik klikne prijedlog
  const selectLocationSuggestion = (suggestion: {
    name: string;
    lat: number;
    lon: number;
  }) => {
    setNewGroup((p) => ({ ...p, locationName: suggestion.name }));
    setLocationVerified(true);
    setShowLocationSuggestions(false);
    setLocationSuggestions([]);
  };

  // ============================================================
  // 2. createGroup - kreiranje grupe na serveru
  // ============================================================
  const createGroup = async () => {
    if (!newGroup.activity.trim() || !newGroup.locationName.trim()) {
      Alert.alert(t("common.error"), t("map.searchPlaceholder"));
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        Alert.alert(t("common.error"), t("auth.notLoggedIn"));
        return;
      }

      const requestBody = {
        creatorName: myName,
        activity: newGroup.category,
        description: newGroup.description.trim(),
        latitude: userLocation?.latitude || 45.815,
        longitude: userLocation?.longitude || 15.9819,
        locationName: newGroup.locationName.trim(),
        maxPeople: Math.max(2, parseInt(newGroup.maxPeople) || 5),
      };

      const res = await fetch(`${API_BASE_URL}/api/activity-groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const newGroupData = await res.json();
        // Transformiraj podatke u frontend format
        const formattedGroup = {
          id: newGroupData.group?.id || newGroupData.id,
          creatorName: myName,
          activity: newGroup.category,
          description: newGroup.description.trim(),
          latitude: userLocation?.latitude || 45.815,
          longitude: userLocation?.longitude || 15.9819,
          locationName: newGroup.locationName.trim(),
          maxPeople: Math.max(2, parseInt(newGroup.maxPeople) || 5),
          members: [myName],
          messages: [
            {
              name: t("groups.system"),
              text: `Grupa kreirana od ${myName}`,
              time: new Date().toLocaleTimeString("hr-HR", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ],
          createdAt: new Date().toISOString(),
        };

        setGroups((prev) => [formattedGroup, ...prev]);
        setSelectedGroup(formattedGroup);
        setShowCreate(false);

        // Reset forme
        setNewGroup({
          activity: "",
          description: "",
          locationName: "",
          maxPeople: "5",
          category: "cafe",
        });
      } else {
        const error = await res.text();
        Alert.alert(t("common.error"), t("groups.createFailed"));
      }
    } catch (error) {
      console.error("Error creating group:", error);
      Alert.alert(t("common.error"), t("groups.createFailed"));
    }
  };

  // ============================================================
  // 3. joinGroup - pridruživanje grupi na serveru
  // ============================================================
  const joinGroup = async (groupId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert(t("common.error"), t("auth.notLoggedIn"));
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/activity-groups/${groupId}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userName: myName }),
        },
      );

      if (res.ok) {
        await loadGroups();
        // ── NOVO: osvježi avatare grupe nakon pridruživanja ──
        if (selectedGroup) {
          fetchMemberAvatars(selectedGroup.members);
        }
        Alert.alert(t("common.success"), t("common.ok"));
      } else {
        const error = await res.json();
        Alert.alert(t("common.error"), error.error || t("groups.joinFailed"));
      }
    } catch (error) {
      console.error("Error joining group:", error);
      Alert.alert(t("common.error"), t("map.locationError"));
    }
  };

  // 4. leaveGroup - napuštanje grupe na serveru
  // ============================================================
  const leaveGroup = async (groupId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert(t("common.error"), t("auth.notLoggedIn"));
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/activity-groups/${groupId}/leave?userName=${encodeURIComponent(myName)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (res.ok) {
        await loadGroups();
        setSelectedGroup(null);
        Alert.alert(t("common.success"), t("groups.leaveSuccess"));
      } else {
        const error = await res.json();
        Alert.alert(t("common.error"), error.error || t("groups.leaveFailed"));
      }
    } catch (error) {
      console.error("Error leaving group:", error);
      Alert.alert(t("common.error"), t("groups.leaveFailed"));
    }
  };

  // ============================================================
  // 5. sendGroupMessage - slanje poruke na server
  // ============================================================
  const sendGroupMessage = async (groupId: string) => {
    if (!chatMsg.trim()) return;

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `${API_BASE_URL}/api/activity-groups/${groupId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userName: myName,
            text: chatMsg.trim(),
          }),
        },
      );

      if (res.ok) {
        // Osvježi poruke
        await loadGroupMessages(groupId);
        setChatMsg("");
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // ============================================================
  // 6. loadGroupMessages - dohvat poruka za odabranu grupu
  // ============================================================
  const loadGroupMessages = async (groupId: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `${API_BASE_URL}/api/activity-groups/${groupId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.ok) {
        const raw = await res.json();
        const messages = (Array.isArray(raw) ? raw : []).map((m: any) => ({
          name: m.userName || m.name || "?",
          text: m.text || m.Text || "",
          time: m.time
            ? new Date(m.time).toLocaleTimeString("hr-HR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : m.Time
              ? new Date(m.Time).toLocaleTimeString("hr-HR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "",
          userAvatar: m.userAvatar || "",
        }));
        setSelectedGroup((prev) => {
          if (!prev) return null;
          // ── NOVO: dohvati avatare članova koji još nisu u memberAvatars ──
          const unknownSenders = messages
            .map((m) => m.name)
            .filter(
              (name) =>
                name !== "Sustav" && name !== myName && !memberAvatars[name],
            );
          if (unknownSenders.length > 0) {
            fetchMemberAvatars([...new Set(unknownSenders)]);
          }
          return { ...prev, messages };
        });
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  // ============================================================
  // 7. deleteGroup - brisanje grupe na serveru
  // ============================================================
  // ZAMIJENI deleteGroup funkciju:
  const deleteGroup = async (groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (g?.creatorName !== myName) {
      setShowDeleteConfirm(null);
      return;
    }
    setShowDeleteConfirm(groupId);
  };

  const confirmDeleteGroup = async (groupId: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/api/activity-groups/${groupId}?creatorName=${encodeURIComponent(myName)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        setGroups((prev) => prev.filter((x) => x.id !== groupId));
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error("Error deleting group:", error);
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  // ============================================================
  // 8. Osvježavanje poruka grupe
  //
  // Ponavlja se samo dok je aplikacija u prvom planu: prije je otvorena
  // grupa slala zahtjev svakih 5 sekundi i kad je telefon bio zaključan.

  useEffect(() => {
    if (!selectedGroup) return;
    fetchMemberAvatars(selectedGroup.members);
  }, [selectedGroup?.id]);

  useActivePolling(
    () => {
      if (selectedGroup) loadGroupMessages(selectedGroup.id);
    },
    5000,
    !!selectedGroup,
  );

  const handleModalBack = () => {
    if (selectedGroup) {
      setSelectedGroup(null);
      setChatMsg("");
    } else if (showCreate) setShowCreate(false);
    else onClose();
  };

  const handleMemberPress = async (memberName: string) => {
    if (memberName === myName) {
      Alert.alert(
        t("profile.cannotMessageSelf"),
        t("profile.cannotMessageSelfDesc"),
      );
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const users = await res.json();
        const nameLower = memberName.toLowerCase().trim();
        const found = users.find((u: any) => {
          const fn = (u.firstName || u.firstname || "").toLowerCase();
          const ln = (u.lastName || u.lastname || "").toLowerCase();
          return `${fn} ${ln}`.trim() === nameLower || fn === nameLower;
        });

        setDmTarget({ name: memberName, userId: found?.id ?? null });
        setShowDMCompose(true);

        // ── NOVO: dohvati avatar za DM target ako već nije u memberAvatars ──
        if (found?.id && !memberAvatars[memberName]) {
          try {
            const profileRes = await fetch(
              `${API_BASE_URL}/api/auth/users/${found.id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (profileRes.ok) {
              const profile = await profileRes.json();
              const rawUrl =
                profile.Avatar ||
                profile.avatar ||
                profile.avatarUrl ||
                profile.profileImage ||
                null;

              if (rawUrl && !rawUrl.startsWith("avatar:") && rawUrl !== "") {
                const normalizedUrl = rawUrl.startsWith("http")
                  ? rawUrl
                  : `${API_BASE_URL}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
                const sep = normalizedUrl.includes("?") ? "&" : "?";
                const finalUrl = `${normalizedUrl}${sep}uid=${found.id}`;
                setMemberAvatars((prev) => ({
                  ...prev,
                  [memberName]: finalUrl,
                }));
              }
            }
          } catch {
            // tiho ignoriraj
          }
        }
      }
    } catch {
      Alert.alert(t("common.error"), t("userProfile.messageFailed"));
    }
  };

  const sendDM = async () => {
    if (!dmTarget.userId || !dmMessage.trim()) {
      if (!dmTarget.userId) {
        Alert.alert(
          t("dm.userNotFound"),
          t("dm.userNotFoundDesc", { name: dmTarget.name }),
        );
      }
      return;
    }
    setSendingDM(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/message/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: dmTarget.userId,
          content: dmMessage.trim(),
        }),
      });
      if (res.ok) {
        setShowDMCompose(false);
        setDmMessage("");
        Alert.alert(
          t("messages.messageSent"),
          t("messages.messageSentTo", { name: dmTarget.name }),
        );
      } else {
        Alert.alert(t("common.error"), t("messages.messageFailed"));
      }
    } catch {
      Alert.alert(t("common.error"), t("messages.messageFailed"));
    } finally {
      setSendingDM(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleModalBack}
    >
      {/* JEDAN Modal, tri različita "ekrana" unutar njega */}
      {selectedGroup ? (
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: DC.bg }}
          // FIX: na Androidu je ovdje stajao behavior="height". Aplikacija radi u
          // edge-to-edge načinu i sustav sam smanjuje prozor kad se otvori tipkovnica,
          // pa je KeyboardAvoidingView smanjivao visinu JOŠ JEDNOM. Dvije se prilagodbe
          // natežu oko visine ekrana kroz cijelu animaciju tipkovnice, što se vidi kao
          // neprekidno treperenje/vibriranje cijelog ekrana. Na Androidu zato nema
          // behaviora — sustav to odradi sam. (Unutar <Modal>-a KeyboardAvoidingView
          // ionako ne radi jer je modal zaseban prozor bez adjustResize; ondje se
          // koristi useInputBottomOffset iz hooks/use-keyboard-offset.)
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          {/* Header */}
          <View style={[ag.chatHeader, { backgroundColor: DC.card }]}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: DC.bg,
                borderWidth: 1,
                borderColor: DC.borderDim,
              }}
              onPress={() => {
                setSelectedGroup(null);
                setChatMsg("");
              }}
            >
              <Text
                style={{
                  color: DC.accent,
                  fontSize: T.meta,
                  fontWeight: "600",
                }}
              >
                ← {t("common.back")}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={ag.chatHeaderTitle} numberOfLines={1}>
                {selectedGroup.activity
                  .replace(/^[\p{Emoji}\s]+/u, "")
                  .trim() || selectedGroup.activity}
              </Text>
              <Text style={ag.chatHeaderSub}>
                {selectedGroup.locationName} · {selectedGroup.members.length}/
                {selectedGroup.maxPeople} {t("map.members")}
              </Text>
            </View>

            {selectedGroup.creatorName === myName ? (
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(selectedGroup.id)}
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1.5,
                  borderColor: DC.border,
                }}
              >
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.meta,
                    fontWeight: "800",
                    letterSpacing: 0.3,
                  }}
                >
                  {t("common.delete")}
                </Text>
              </TouchableOpacity>
            ) : selectedGroup.members.includes(myName) ? (
              <TouchableOpacity
                onPress={() => leaveGroup(selectedGroup.id)}
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                }}
              >
                <Text
                  style={{
                    color: DC.accent,
                    fontSize: T.meta,
                    fontWeight: "700",
                  }}
                >
                  {t("groups.leave")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Članovi */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              ag.membersRow,
              { backgroundColor: DC.card, borderBottomColor: DC.borderDim },
            ]}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 14,
            }}
          >
            {selectedGroup.members.map((m, i) => {
              const isMe = m === myName;
              const isCreator = m === selectedGroup.creatorName;
              let avatarUrl: string | null = null;

              if (isMe) {
                avatarUrl = myAvatar || memberAvatars[m] || null;
              } else if (isCreator && selectedGroup.creatorAvatar) {
                const ca = selectedGroup.creatorAvatar;
                if (!ca.startsWith("avatar:")) {
                  avatarUrl = ca.startsWith("http")
                    ? ca
                    : `${API_BASE_URL}${ca.startsWith("/") ? "" : "/"}${ca}`;
                }
              } else {
                const raw = memberAvatars[m] || null;
                avatarUrl = raw; // može biti i "avatar:male" ili pravi URL
              }

              return (
                <TouchableOpacity
                  key={i}
                  style={{ alignItems: "center" }}
                  onPress={() => handleMemberPress(m)}
                >
                  <View
                    style={[
                      ag.memberAvatar,
                      isMe && { borderWidth: 2, borderColor: DC.border },
                    ]}
                  >
                    {PRESET_AVATARS[avatarUrl ?? ""] ? (
                      <Image
                        source={PRESET_AVATARS[avatarUrl ?? ""]}
                        style={{ width: 36, height: 36, borderRadius: 18 }}
                        resizeMode="cover"
                      />
                    ) : avatarUrl && !avatarUrl.startsWith("avatar:") ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={{ width: 36, height: 36, borderRadius: 18 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        {m[0]?.toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[ag.memberName, { color: DC.textSub }]}
                    numberOfLines={1}
                  >
                    {m.split(" ")[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {Array.from({
              length: selectedGroup.maxPeople - selectedGroup.members.length,
            }).map((_, i) => (
              <View key={`e_${i}`} style={{ alignItems: "center" }}>
                <View
                  style={[
                    ag.memberAvatarEmpty,
                    { backgroundColor: DC.cardHover, borderColor: DC.border },
                  ]}
                >
                  <Text style={{ color: DC.accent, fontSize: T.title }}>+</Text>
                </View>
                <Text style={{ fontSize: 10, color: DC.textDim, marginTop: 2 }}>
                  {t("groups.freeSpots")}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Poruke */}
          <FlatList
            ref={flatRef}
            data={selectedGroup.messages || []}
            keyExtractor={(_, i) => i.toString()}
            style={{ backgroundColor: DC.bg }}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            renderItem={({ item }) => {
              if (!item || typeof item !== "object") return null;
              const name = item.name || "?";
              const text = item.text || "";
              const time = item.time || "";
              const isMe = name === myName;
              const isSys = name === "Sustav";
              if (isSys)
                return (
                  <View style={{ alignItems: "center", marginVertical: 6 }}>
                    <Text
                      style={{
                        fontSize: T.meta,
                        color: DC.textDim,
                        fontStyle: "italic",
                      }}
                    >
                      {text}
                    </Text>
                  </View>
                );
              const avatarUrl = isMe
                ? myAvatar || memberAvatars[myName] || null
                : resolveAvatarUrl(item.userAvatar, API_BASE_URL) ||
                  memberAvatars[name];
              return (
                <View
                  style={[
                    ag.msgRow,
                    isMe
                      ? { justifyContent: "flex-end" }
                      : { justifyContent: "flex-start" },
                  ]}
                >
                  {!isMe && (
                    <View
                      style={[ag.msgAvatar, { backgroundColor: DC.cardHover }]}
                    >
                      {PRESET_AVATARS[avatarUrl ?? ""] ? (
                        <Image
                          source={PRESET_AVATARS[avatarUrl ?? ""]}
                          style={{ width: 30, height: 30, borderRadius: 15 }}
                          resizeMode="cover"
                        />
                      ) : avatarUrl && !avatarUrl.startsWith("avatar:") ? (
                        <Image
                          source={{ uri: avatarUrl }}
                          style={{ width: 30, height: 30, borderRadius: 15 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text
                          style={{
                            color: DC.text,
                            fontSize: T.meta,
                            fontWeight: "700",
                          }}
                        >
                          {name[0]?.toUpperCase()}
                        </Text>
                      )}
                    </View>
                  )}
                  <View style={{ maxWidth: "70%" }}>
                    {!isMe && (
                      <Text style={[ag.msgSender, { color: DC.accent }]}>
                        {name}
                      </Text>
                    )}
                    <View
                      style={[
                        ag.bubble,
                        isMe
                          ? ag.bubbleMine
                          : {
                              backgroundColor: DC.card,
                              borderBottomLeftRadius: 4,
                            },
                      ]}
                    >
                      <Text
                        style={{
                          color: isMe ? "#fff" : DC.text,
                          fontSize: T.body,
                        }}
                      >
                        {text}
                      </Text>
                    </View>
                    <Text
                      style={[
                        ag.msgTime,
                        isMe ? { textAlign: "right" } : {},
                        { color: DC.textDim },
                      ]}
                    >
                      {time}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          {/* Input. Na Androidu je ovo unutar <Modal>-a, gdje
              KeyboardAvoidingView ne radi (modal je zaseban prozor bez
              adjustResize) — odmak se računa iz izmjerene visine tipkovnice. */}
          {(selectedGroup.members || []).includes(myName) ? (
            <View
              style={[
                ag.inputRow,
                {
                  backgroundColor: DC.card,
                  borderTopColor: DC.borderDim,
                  borderTopWidth: 1,
                  paddingBottom: Platform.OS === "ios" ? 34 : 16,
                  marginBottom:
                    Platform.OS === "android" ? groupChatInputOffset : 0,
                },
              ]}
            >
              <TextInput
                selectTextOnFocus
                style={[
                  ag.input,
                  {
                    backgroundColor: DC.cardHover,
                    color: DC.text,
                    borderWidth: 1,
                    borderColor: DC.border,
                  },
                ]}
                placeholder={t("groups.sendMessage")}
                placeholderTextColor={DC.textDim}
                value={chatMsg}
                onChangeText={setChatMsg}
                returnKeyType="send"
                onSubmitEditing={() => sendGroupMessage(selectedGroup.id)}
              />
              <TouchableOpacity
                style={[
                  ag.sendBtn,
                  !chatMsg.trim() && { backgroundColor: DC.cardHover },
                ]}
                onPress={() => sendGroupMessage(selectedGroup.id)}
                disabled={!chatMsg.trim()}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: T.lead,
                    letterSpacing: -0.5,
                  }}
                >
                  ➤
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={{
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: DC.borderDim,
                backgroundColor: DC.card,
              }}
            >
              <TouchableOpacity
                style={{
                  backgroundColor: DC.cardHover,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                  borderWidth: 1.5,
                  borderColor: DC.border,
                }}
                onPress={() => joinGroup(selectedGroup.id)}
              >
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.lead,
                    fontWeight: "700",
                  }}
                >
                  {t("groups.joinGroup")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {showDMCompose && (
            <View style={ag.dmOverlay}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={() => {
                  setShowDMCompose(false);
                  setDmMessage("");
                }}
              />
              <View style={ag.dmSheet}>
                <View style={ag.dmHandle} />

                {/* Header */}
                <View style={ag.dmHeader}>
                  <View style={ag.dmAvatar}>
                    {memberAvatars[dmTarget.name] &&
                    !memberAvatars[dmTarget.name].startsWith("avatar:") ? (
                      <Image
                        source={{ uri: memberAvatars[dmTarget.name] }}
                        style={{ width: 46, height: 46, borderRadius: 23 }}
                        resizeMode="cover"
                      />
                    ) : PRESET_AVATARS[memberAvatars[dmTarget.name] ?? ""] ? (
                      <Image
                        source={PRESET_AVATARS[memberAvatars[dmTarget.name]]}
                        style={{ width: 46, height: 46, borderRadius: 23 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: T.title,
                          fontWeight: "800",
                        }}
                      >
                        {dmTarget.name[0]?.toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ag.dmTitle}>{t("groups.privateMessage")}</Text>
                    <Text style={ag.dmSubtitle}>→ {dmTarget.name}</Text>
                  </View>
                  {!dmTarget.userId && (
                    <View style={ag.dmWarnBadge}>
                      <Text
                        style={{
                          color: "#ff9500",
                          fontSize: 10,
                          fontWeight: "700",
                        }}
                      >
                        ⚠️ {t("dm.notFound")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Input */}
                <TextInput
                  style={ag.dmInput}
                  placeholder={t("groups.dmPlaceholder", {
                    name: dmTarget.name,
                  })}
                  placeholderTextColor="#bbb"
                  value={dmMessage}
                  onChangeText={setDmMessage}
                  multiline
                  maxLength={500}
                  autoFocus
                  textAlignVertical="top"
                />

                {/* Quick messages */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 10 }}
                >
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["Hej! 👋", "Idemo? 🚀", "Gdje si? 📍", "OK! ✅"].map(
                      (q) => (
                        <TouchableOpacity
                          key={q}
                          style={ag.dmQuickBtn}
                          onPress={() => setDmMessage(q)}
                        >
                          <Text style={ag.dmQuickText}>{q}</Text>
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                </ScrollView>

                {/* Actions */}
                <View style={ag.dmActions}>
                  <TouchableOpacity
                    style={ag.dmCancelBtn}
                    onPress={() => {
                      setShowDMCompose(false);
                      setDmMessage("");
                    }}
                  >
                    <Text style={ag.dmCancelText}>{t("common.cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      ag.dmSendBtn,
                      (!dmMessage.trim() || sendingDM || !dmTarget.userId) &&
                        ag.dmSendBtnDisabled,
                    ]}
                    onPress={sendDM}
                    disabled={
                      !dmMessage.trim() || sendingDM || !dmTarget.userId
                    }
                  >
                    {sendingDM ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={ag.dmSendText}>{t("groups.sendDM")} 💬</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      ) : showCreate ? (
        // ─── Forma za kreiranje ───────────────────────────────────────────────
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: DC.bg }}
          // FIX: na Androidu je ovdje stajao behavior="height". Aplikacija radi u
          // edge-to-edge načinu i sustav sam smanjuje prozor kad se otvori tipkovnica,
          // pa je KeyboardAvoidingView smanjivao visinu JOŠ JEDNOM. Dvije se prilagodbe
          // natežu oko visine ekrana kroz cijelu animaciju tipkovnice, što se vidi kao
          // neprekidno treperenje/vibriranje cijelog ekrana. Na Androidu zato nema
          // behaviora — sustav to odradi sam. (Unutar <Modal>-a KeyboardAvoidingView
          // ionako ne radi jer je modal zaseban prozor bez adjustResize; ondje se
          // koristi useInputBottomOffset iz hooks/use-keyboard-offset.)
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 20,
              paddingTop: Platform.OS === "ios" ? 54 : 36,
              borderBottomWidth: 1.5,
              borderBottomColor: DC.border,
              backgroundColor: DC.bg,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: T.title,
                fontWeight: "800",
                color: DC.text,
              }}
            >
              {t("groups.createNew")}
            </Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text
                style={{
                  fontSize: T.lead,
                  color: DC.accent,
                  fontWeight: "700",
                }}
              >
                {t("common.back")}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: DC.bg }}
          >
            {/* ── VRSTA AKTIVNOSTI ── */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 10,
                }}
              >
                {t("groups.activityType")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {ACTIVITY_TEMPLATES.map((tmpl) => {
                  const active = newGroup.category === tmpl.value;
                  const catMeta =
                    placeCategories[tmpl.value as keyof typeof placeCategories];
                  const bgColor = catMeta?.color || V.silverDim;
                  return (
                    <TouchableOpacity
                      key={tmpl.value}
                      style={{
                        width: CELL_W,
                        height: 130,
                        backgroundColor: active ? bgColor : DC.card,
                        borderRadius: 12,
                        justifyContent: "center",
                        alignItems: "center",
                        paddingHorizontal: 4,
                        paddingVertical: 8,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? bgColor : DC.borderDim,
                      }}
                      onPress={() =>
                        setNewGroup((p) => ({
                          ...p,
                          category: tmpl.value,
                          activity: tmpl.label,
                        }))
                      }
                    >
                      <CategoryCoin
                        id={tmpl.value}
                        fallbackGlyph={EMOJIS[tmpl.value] || "📍"}
                        size={96}
                        style={{ marginBottom: 4 }}
                      />
                      <Text
                        style={{
                          fontSize: T.caption,
                          fontWeight: "600",
                          color: active ? "#fff" : DC.textSub,
                          textAlign: "center",
                        }}
                        numberOfLines={2}
                      >
                        {tmpl.label.replace(/^[\p{Emoji}\s]+/u, "").trim()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── OPIS AKTIVNOSTI ── */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 10,
                }}
              >
                {t("groups.activityDesc")}
              </Text>
              <TextInput
                selectTextOnFocus
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: T.body,
                  color: DC.text,
                }}
                placeholder={t("groups.activityPlaceholder")}
                placeholderTextColor={DC.textDim}
                value={newGroup.activity}
                onChangeText={(v) =>
                  setNewGroup((p) => ({ ...p, activity: v }))
                }
                maxLength={80}
              />
            </View>

            {/* ── LOKACIJA ── */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 10,
                }}
              >
                {t("groups.location")}
              </Text>
              <TextInput
                selectTextOnFocus
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: T.body,
                  color: DC.text,
                }}
                placeholder={t("groups.locationPlaceholder")}
                placeholderTextColor={DC.textDim}
                value={newGroup.locationName}
                onChangeText={handleLocationInputChange}
                maxLength={100}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 8,
                  gap: 6,
                }}
              >
                {locationVerified ? (
                  <Text
                    style={{
                      color: "#34c759",
                      fontSize: T.body,
                      fontWeight: "700",
                    }}
                  >
                    ✓ Lokacija potvrđena
                  </Text>
                ) : newGroup.locationName.trim().length >= 3 ? (
                  <Text style={{ color: DC.textDim, fontSize: T.meta }}>
                    Odaberite lokaciju s popisa da je potvrdite
                  </Text>
                ) : null}
              </View>

              {/* ★★★ NOVO — dropdown s prijedlozima ★★★ */}
              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <View
                  style={{
                    backgroundColor: DC.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DC.border,
                    marginTop: 6,
                    overflow: "hidden",
                  }}
                >
                  {locationSuggestions.map((sug, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderBottomWidth:
                          idx < locationSuggestions.length - 1 ? 1 : 0,
                        borderBottomColor: DC.borderDim,
                      }}
                      onPress={() => selectLocationSuggestion(sug)}
                    >
                      <Text
                        style={{ color: DC.text, fontSize: T.meta }}
                        numberOfLines={2}
                      >
                        📍 {sug.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* ── KRATKI OPIS ── */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 10,
                }}
              >
                {t("groups.shortDescription")}
              </Text>
              <TextInput
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: T.body,
                  color: DC.text,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
                placeholder={t("groups.descriptionPlaceholder")}
                placeholderTextColor={DC.textDim}
                value={newGroup.description}
                onChangeText={(v) =>
                  setNewGroup((p) => ({ ...p, description: v }))
                }
                multiline
                maxLength={200}
              />
            </View>

            {/* ── MAKS. BROJ LJUDI ── */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 10,
                }}
              >
                {t("groups.maxPeople")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[2, 3, 4, 5, 8, 10].map((n) => {
                  const active = newGroup.maxPeople === String(n);
                  return (
                    <TouchableOpacity
                      key={n}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 9,
                        backgroundColor: active ? DC.cardHover : DC.card,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? DC.border : DC.borderDim,
                      }}
                      onPress={() =>
                        setNewGroup((p) => ({ ...p, maxPeople: String(n) }))
                      }
                    >
                      <Text
                        style={{
                          fontSize: T.meta,
                          color: active ? DC.text : DC.textDim,
                          fontWeight: active ? "700" : "400",
                        }}
                      >
                        {n}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── OBJAVI GUMB ── */}
            <TouchableOpacity
              style={{
                margin: 16,
                backgroundColor: DC.cardHover,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: DC.border,
                paddingVertical: 16,
                alignItems: "center",
              }}
              onPress={createGroup}
            >
              <Text
                style={{ color: DC.text, fontSize: T.lead, fontWeight: "700" }}
              >
                {t("groups.postActivity")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        // ─── Lista grupa ──────────────────────────────────────────────────────
        <View style={{ flex: 1, backgroundColor: DC.bg }}>
          {/* Header — bez +Nova aktivnost gumba */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 20,
              paddingTop: Platform.OS === "ios" ? 54 : 36,
              borderBottomWidth: 1.5,
              borderBottomColor: DC.border,
              backgroundColor: DC.bg,
            }}
          >
            <Text
              style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
            >
              {t("groups.title")}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text
                style={{
                  fontSize: T.body,
                  color: DC.textDim,
                  fontWeight: "600",
                }}
              >
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>

          {groups.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <Text style={{ fontSize: 64 }}>🤝</Text>
              <Text
                style={{ fontSize: T.title, fontWeight: "700", color: DC.text }}
              >
                {t("groups.noActivities")}
              </Text>
              <Text
                style={{
                  fontSize: T.body,
                  color: DC.textDim,
                  textAlign: "center",
                  paddingHorizontal: 40,
                }}
              >
                {t("groups.beFirst")}
              </Text>
            </View>
          ) : (
            <FlatList
              data={groups}
              keyExtractor={(g) => g.id}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 100,
                backgroundColor: DC.bg,
              }}
              style={{ backgroundColor: DC.bg }}
              renderItem={({ item: g }) => {
                if (!g || typeof g !== "object") return null;

                const members = Array.isArray(g.members) ? g.members : [];
                const messages = Array.isArray(g.messages) ? g.messages : [];

                const isMember = members.includes(myName);
                const isFull = members.length >= (g.maxPeople || 0);
                const isCreator = g.creatorName === myName;

                const creatorAvatarUrl = resolveAvatarUrl(
                  (g as any).creatorAvatar,
                  API_BASE_URL,
                );

                // IZVAN renderItem-a (kao konstanta na razini komponente):
                const activityToCategory: Record<string, string> = {
                  "☕ Kava": "cafe",
                  "🍽️ Ručak/Večera": "restaurant",
                  "🎵 Noćni izlazak": "club",
                  "🏖️ Plaža": "beach",
                  "🎬 Kino": "cinema",
                  "🌳 Šetnja": "park",
                  "🔐 Escape Room": "escapeRoom",
                  "🎯 Paintball": "paintball",
                  "⛰️ Planinarenje": "mountain",
                  "💧 Toplice": "spa",
                  Kavica: "cafe",
                };

                const categoryKey =
                  ACTIVITY_TEMPLATES.find(
                    (tmpl) =>
                      tmpl.label === g.activity || tmpl.value === g.activity,
                  )?.value ?? "";
                // SIGURNO dohvati color — bez spreada ili Object.keys
                const color =
                  (categoryKey &&
                    placeCategories[categoryKey as keyof typeof placeCategories]
                      ?.color) ||
                  V.silverDim;

                const timeAgo = Math.floor(
                  (Date.now() - new Date(g.createdAt || Date.now()).getTime()) /
                    60000,
                );
                const timeStr =
                  timeAgo < 60
                    ? t("groups.agoMinutes", { count: timeAgo })
                    : t("groups.agoHours", { count: Math.floor(timeAgo / 60) });

                return (
                  <TouchableOpacity
                    style={{
                      backgroundColor: DC.card,
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: color,
                      borderWidth: 1,
                      borderColor: DC.borderDim,
                    }}
                    onPress={() => {
                      setSelectedGroup(g);
                      loadGroupMessages(g.id); // ← DODAJ OVO
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: T.lead,
                            fontWeight: "800",
                            color: DC.text,
                          }}
                          numberOfLines={1}
                        >
                          {(g.activity || t("groups.defaultActivity"))
                            .replace(/^[\p{Emoji}\s]+/u, "")
                            .trim() ||
                            g.activity ||
                            t("groups.defaultActivity")}
                        </Text>
                        <Text
                          style={{
                            fontSize: T.meta,
                            color: DC.accent,
                            marginTop: 2,
                          }}
                        >
                          {g.locationName || t("groups.unknownLocation")}
                        </Text>
                        {g.description ? (
                          <Text
                            style={{
                              fontSize: T.meta,
                              color: DC.textDim,
                              marginTop: 4,
                            }}
                            numberOfLines={2}
                          >
                            {g.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {members.slice(0, 4).map((m, i) => {
                          const isCreatorMember = m === g.creatorName;
                          const avatarToUse = isCreatorMember
                            ? creatorAvatarUrl
                            : resolveAvatarUrl(memberAvatars[m], API_BASE_URL);
                          return (
                            <View
                              key={i}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 13,
                                backgroundColor: V.visited,
                                justifyContent: "center",
                                alignItems: "center",
                                borderWidth: 2,
                                borderColor: "#2a4230",
                                marginLeft: i > 0 ? -8 : 0,
                              }}
                            >
                              {avatarToUse &&
                              avatarToUse.startsWith("avatar:") ? (
                                <Image
                                  source={PRESET_AVATARS[avatarToUse]}
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 13,
                                  }}
                                  resizeMode="cover"
                                />
                              ) : avatarToUse ? (
                                <Image
                                  source={{ uri: avatarToUse }}
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 13,
                                  }}
                                  resizeMode="cover"
                                />
                              ) : (
                                <Text
                                  style={{
                                    color: "#fff",
                                    fontSize: 10,
                                    fontWeight: "700",
                                  }}
                                >
                                  {(m || "")[0]?.toUpperCase()}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                        <Text
                          style={{
                            fontSize: T.meta,
                            color: DC.textSub,
                            fontWeight: "600",
                            marginLeft: 4,
                          }}
                        >
                          {members.length}/{g.maxPeople || 0}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{ fontSize: T.caption, color: DC.textDim }}
                        >
                          {timeStr}
                        </Text>
                        {isCreator ? (
                          <View
                            style={{
                              backgroundColor: DC.bg,
                              borderRadius: 12,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderWidth: 1,
                              borderColor: DC.border,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: T.caption,
                                color: DC.accent,
                                fontWeight: "700",
                              }}
                            >
                              {t("groups.yourGroup")}
                            </Text>
                          </View>
                        ) : isMember ? (
                          <View
                            style={{
                              backgroundColor: "#1a3a20",
                              borderRadius: 12,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: T.caption,
                                color: "#34c759",
                                fontWeight: "700",
                              }}
                            >
                              ✓ {t("groups.joined")}
                            </Text>
                          </View>
                        ) : isFull ? (
                          <View
                            style={{
                              backgroundColor: DC.bg,
                              borderRadius: 12,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{ fontSize: T.caption, color: DC.textDim }}
                            >
                              {t("groups.full")}
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={{
                              backgroundColor: DC.cardHover,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: DC.border,
                            }}
                            onPress={() => joinGroup(g.id)}
                          >
                            <Text
                              style={{
                                fontSize: T.meta,
                                color: DC.text,
                                fontWeight: "700",
                              }}
                            >
                              {t("groups.join")}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* ── FAB — Dodaj novu aktivnost, uvijek vidljiv ── */}
          <TouchableOpacity
            style={{
              position: "absolute",
              bottom: 80,
              left: 20,
              right: 20,
              backgroundColor: DC.cardHover,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: DC.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
            onPress={() => setShowCreate(true)}
          >
            <Text
              style={{ color: DC.text, fontSize: T.lead, fontWeight: "700" }}
            >
              {t("groups.create")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Confirm brisanje - Vara stil */}
      {showDeleteConfirm && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: DC.overlay,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <View
            style={{
              backgroundColor: DC.bg,
              borderRadius: 20,
              padding: 28,
              marginHorizontal: 24,
              borderWidth: 1.5,
              borderColor: DC.border,
            }}
          >
            <Text
              style={{
                fontSize: T.screen,
                textAlign: "center",
                marginBottom: 8,
              }}
            ></Text>
            <Text
              style={{
                fontSize: T.lead,
                fontWeight: "800",
                color: DC.text,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {t("groups.deleteConfirm")}
            </Text>
            <Text
              style={{
                fontSize: T.meta,
                color: DC.textDim,
                textAlign: "center",
                marginBottom: 24,
                lineHeight: 20,
              }}
            >
              {t("groups.deleteConfirmQuestion")}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: isDark ? "#2a3020" : "#e8f0d8",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: isDark ? "#4a6030" : "#5a8a40",
                marginBottom: 10,
              }}
              onPress={() => confirmDeleteGroup(showDeleteConfirm)}
            >
              <Text
                style={{
                  color: isDark ? "#c8d8a0" : "#2a5a10",
                  fontSize: T.body,
                  fontWeight: "700",
                }}
              >
                {t("common.delete")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: DC.card,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: DC.borderDim,
              }}
              onPress={() => setShowDeleteConfirm(null)}
            >
              <Text
                style={{
                  color: DC.textSub,
                  fontSize: T.body,
                  fontWeight: "600",
                }}
              >
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Modal>
  );
}

// ─── Stilovi za ActivityGroupsModal ──────────────────────────────────────────
// const ag = StyleSheet.create({
//   // Chat
//   chatHeader: {
//     flexDirection: "row",
//     alignItems: "center",
//     padding: 16,
//     paddingTop: Platform.OS === "ios" ? 54 : 36,
//     backgroundColor: "#667eea",
//     gap: 12,
//   },
//   dmOverlay: {
//     position: "absolute" as const,
//     top: 0,
//     left: 0,
//     right: 0,
//     bottom: 0,
//     backgroundColor: "rgba(0,0,0,0.55)",
//     justifyContent: "flex-end" as const,
//     zIndex: 999,
//   },
//   dmSheet: {
//     backgroundColor: "#fff",
//     borderTopLeftRadius: 24,
//     borderTopRightRadius: 24,
//     padding: 20,
//     paddingBottom: Platform.OS === "ios" ? 34 : 20,
//     maxHeight: "70%",
//   },
//   dmHandle: {
//     width: 40,
//     height: 4,
//     borderRadius: 2,
//     backgroundColor: "#e0e0e0",
//     alignSelf: "center" as const,
//     marginBottom: 16,
//   },
//   dmHeader: {
//     flexDirection: "row" as const,
//     alignItems: "center" as const,
//     gap: 12,
//     marginBottom: 14,
//     paddingBottom: 14,
//     borderBottomWidth: 1,
//     borderBottomColor: "#f0f0f0",
//   },
//   dmAvatar: {
//     width: 46,
//     height: 46,
//     borderRadius: 23,
//     backgroundColor: "#667eea",
//     justifyContent: "center" as const,
//     alignItems: "center" as const,
//   },
//   dmTitle: { fontSize: T.lead, fontWeight: "700" as const, color: "#1a1a1a" },
//   dmSubtitle: { fontSize: T.body, color: "#667eea", marginTop: 2 },
//   dmWarnBadge: {
//     backgroundColor: "#fff8e6",
//     borderRadius: 8,
//     paddingHorizontal: 8,
//     paddingVertical: 4,
//   },
//   dmInput: {
//     backgroundColor: "#f5f5f5",
//     borderRadius: 14,
//     padding: 14,
//     fontSize: T.body,
//     minHeight: 90,
//     color: "#333",
//     marginBottom: 12,
//   },
//   dmQuickBtn: {
//     backgroundColor: "#f0f0ff",
//     borderRadius: 18,
//     paddingHorizontal: 12,
//     paddingVertical: 7,
//   },
//   dmQuickText: { fontSize: T.meta, color: "#667eea", fontWeight: "600" },
//   dmActions: {
//     flexDirection: "row" as const,
//     gap: 10,
//     marginTop: 4,
//   },
//   dmCancelBtn: {
//     paddingVertical: 13,
//     paddingHorizontal: 20,
//     borderRadius: 12,
//     backgroundColor: "#f0f0f0",
//     alignItems: "center" as const,
//   },
//   dmCancelText: { color: "#666", fontSize: T.body, fontWeight: "600" },
//   dmSendBtn: {
//     flex: 1,
//     paddingVertical: 13,
//     borderRadius: 12,
//     backgroundColor: "#667eea",
//     alignItems: "center" as const,
//     justifyContent: "center" as const,
//     shadowColor: "#667eea",
//     shadowOffset: { width: 0, height: 3 },
//     shadowOpacity: 0.3,
//     shadowRadius: 6,
//     elevation: 4,
//   },
//   dmSendBtnDisabled: {
//     backgroundColor: "#ccc",
//     shadowOpacity: 0,
//     elevation: 0,
//   },
//   dmSendText: { color: "#fff", fontSize: T.body, fontWeight: "700" },

//   chatHeaderBack: { color: "#fff", fontSize: T.screen },
//   chatHeaderTitle: { color: "#fff", fontSize: T.lead, fontWeight: "800" },
//   chatHeaderSub: { color: "rgba(255,255,255,0.8)", fontSize: T.meta },
//   membersRow: {
//     maxHeight: 72,
//     borderBottomWidth: 1,
//     borderBottomColor: "#eee",
//     backgroundColor: "#f8f8ff",
//   },
//   memberAvatar: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     backgroundColor: "#667eea",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   memberAvatarEmpty: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     backgroundColor: "#f0f0f0",
//     justifyContent: "center",
//     alignItems: "center",
//     borderWidth: 2,
//     borderColor: "#ddd",
//     borderStyle: "dashed",
//   },
//   memberName: { fontSize: 10, color: "#555", marginTop: 2 },
//   msgRow: { flexDirection: "row", marginVertical: 4, gap: 8 },
//   msgAvatar: {
//     width: 30,
//     height: 30,
//     borderRadius: 15,
//     backgroundColor: "#667eea",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   msgSender: { fontSize: T.caption, color: "#999", marginBottom: 2 },
//   bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
//   bubbleMine: { backgroundColor: "#667eea", borderBottomRightRadius: 4 },
//   bubbleOther: { backgroundColor: "#f2f2f7", borderBottomLeftRadius: 4 },
//   msgTime: { fontSize: 10, color: "#bbb", marginTop: 2 },
//   inputRow: {
//     flexDirection: "row",
//     padding: 12,
//     borderTopWidth: 1,
//     borderTopColor: "#eee",
//     gap: 8,
//     backgroundColor: "#fff",
//   },
//   input: {
//     flex: 1,
//     backgroundColor: "#f2f2f7",
//     borderRadius: 22,
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     fontSize: T.body,
//     color: "#333",
//   },
//   sendBtn: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     backgroundColor: "#667eea",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   joinBtn: {
//     backgroundColor: "#667eea",
//     borderRadius: 14,
//     paddingVertical: 14,
//     alignItems: "center",
//   },
//   joinBtnText: { color: "#fff", fontSize: T.lead, fontWeight: "700" },
//   // Nav header (forma za kreiranje)
//   navHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     padding: 20,
//     paddingTop: Platform.OS === "ios" ? 54 : 36,
//     borderBottomWidth: 1,
//     borderBottomColor: "#eee",
//   },
//   navHeaderLink: { fontSize: T.lead, color: "#667eea" },
//   navHeaderTitle: { fontSize: T.lead, fontWeight: "800" },
//   formLabel: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: "#333",
//     marginBottom: 8,
//   },
//   formInput: {
//     backgroundColor: "#f5f5f5",
//     borderRadius: 12,
//     padding: 14,
//     fontSize: T.body,
//     color: "#333",
//     marginBottom: 16,
//     borderWidth: 1,
//     borderColor: "#e0e0e0",
//   },
//   templateChip: {
//     paddingHorizontal: 14,
//     paddingVertical: 9,
//     borderRadius: 22,
//     backgroundColor: "#f0f0f0",
//   },
//   templateChipActive: { backgroundColor: "#667eea" },
//   templateChipText: { fontSize: T.meta, fontWeight: "600", color: "#444" },
//   // Lista grupa
//   listHeader: {
//     backgroundColor: "#667eea",
//     padding: 20,
//     paddingTop: Platform.OS === "ios" ? 54 : 36,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   listHeaderTitle: { color: "#fff", fontSize: T.title, fontWeight: "800" },
//   newBtn: {
//     backgroundColor: "rgba(255,255,255,0.25)",
//     borderRadius: 20,
//     paddingHorizontal: 14,
//     paddingVertical: 7,
//   },
//   groupCard: {
//     backgroundColor: "#fff",
//     borderRadius: 16,
//     padding: 16,
//     marginBottom: 12,
//     borderLeftWidth: 4,
//     elevation: 2,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.08,
//     shadowRadius: 4,
//   },
//   groupTitle: { fontSize: T.lead, fontWeight: "800", color: "#1a1a1a" },
//   groupLocation: { fontSize: T.meta, color: "#667eea", marginTop: 2 },
//   groupDesc: { fontSize: T.meta, color: "#666", marginTop: 4 },
//   groupIcon: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     justifyContent: "center",
//     alignItems: "center",
//     marginLeft: 12,
//   },
//   groupFooter: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     marginTop: 12,
//   },
//   footerAvatar: {
//     width: 26,
//     height: 26,
//     borderRadius: 13,
//     backgroundColor: "#667eea",
//     justifyContent: "center",
//     alignItems: "center",
//     borderWidth: 2,
//     borderColor: "#fff",
//   },
//   groupCount: { fontSize: T.meta, color: "#666", fontWeight: "600", marginLeft: 4 },
//   badgeOwn: {
//     backgroundColor: "#f0f0ff",
//     borderRadius: 12,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//   },
//   badgeOwnText: { fontSize: T.caption, color: "#667eea", fontWeight: "700" },
//   badgeMember: {
//     backgroundColor: "#e8f5e9",
//     borderRadius: 12,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//   },
//   badgeMemberText: { fontSize: T.caption, color: "#34c759", fontWeight: "700" },
//   badgeFull: {
//     backgroundColor: "#f9f9f9",
//     borderRadius: 12,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//   },
//   joinSmallBtn: {
//     backgroundColor: "#667eea",
//     borderRadius: 12,
//     paddingHorizontal: 12,
//     paddingVertical: 5,
//   },
// });

// ─── Plan My Day Modal ────────────────────────────────────────────────────────
type PlanPeriod = "dan" | "vikend" | "tjedan" | "2tjedna" | "godisnji";
type CompanionType = "solo" | "partner" | "prijatelji" | "obitelj" | "misovito";
type TransportType = "auto" | "javni" | "pjesice" | "bicikl";
type PreferenceType = "otvoreno" | "zatvoreno" | "kombinirano";
type PlanStep = "form" | "loading" | "result";

// ─── Animated Progress Bar ────────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: (step + 1) / total,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [step]);
  return (
    <View style={pb.track}>
      <Animated.View
        style={[
          pb.fill,
          {
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}
// const pb = StyleSheet.create({
//   track: {
//     height: 4,
//     backgroundColor: "rgba(102,126,234,0.2)",
//     borderRadius: 2,
//     overflow: "hidden",
//     marginTop: 12,
//   },
//   fill: { height: "100%", backgroundColor: "#667eea", borderRadius: 2 },
// });

// ─── Helper: dohvati stvarna mjesta iz OSM ─────────────────────────────────────
async function fetchVenuesNearCity(
  cityQuery: string,
  radiusKm: number,
  interests: string[],
): Promise<{
  geocoded: { latitude: number; longitude: number; displayName: string } | null;
  venues: Record<
    string,
    { name: string; address?: string; latitude: number; longitude: number }[]
  >;
}> {
  const geocoded = await geocodeCity(cityQuery);
  if (!geocoded) return { geocoded: null, venues: {} };

  // UVIJEK traži sve relevantne kategorije, interests samo određuju prioritet
  const allCats = [
    "restaurant",
    "cafe",
    "beach",
    "landmark",
    "park",
    "museum",
    "accommodation",
    "club",
    "cinema",
    "theater",
    "spa",
    "market",
    "mountain",
    "nationalPark",
    "cave",
    "escapeRoom",
    "paintball",
  ];

  const cats = interests.length > 0 ? interests : allCats;

  const places = await getPlacesInRadius(
    geocoded.latitude,
    geocoded.longitude,
    radiusKm,
    cats as any,
  );

  const venues: Record<
    string,
    { name: string; address?: string; latitude: number; longitude: number }[]
  > = {};

  for (const p of places) {
    if (!venues[p.type]) venues[p.type] = [];
    // Min 5, max 15 opcija po kategoriji
    if (venues[p.type].length < 5) {
      venues[p.type].push({
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
      });
    }
  }

  return { geocoded, venues };
}

// ─── Template generator s pravim imenima (V2 - više opcija) ────────────────────
function buildPlanWithVenues(
  destination: string,
  postalCode: string,
  accommodationAddress: string,
  period: PlanPeriod,
  people: string,
  companions: CompanionType,
  budget: string,
  activityRadius: number,
  transport: TransportType,
  preference: PreferenceType,
  interests: string[],
  venues: Record<string, { name: string; address?: string }[]>,
  t: (key: string, opts?: any) => string,
): string {
  const DAYS: Record<PlanPeriod, number> = {
    dan: 1,
    vikend: 2,
    tjedan: 7,
    "2tjedna": 14,
    godisnji: 10,
  };
  const days = DAYS[period] || 1;
  const ppl = parseInt(people) || 2;
  const bdg = parseInt(budget) || 500;
  const dayBudget = Math.round(bdg / days);
  const perPerson = Math.round(dayBudget / ppl);

  // Sve opcije za kategoriju (do 10) rotiraju po danima
  const get = (type: string, idx = 0): string => {
    const list = venues[type] || [];
    if (!list.length) return "";
    const item = list[idx % list.length];
    return item.address ? `${item.name} (${item.address})` : item.name;
  };

  // Prikaz svih opcija za kategoriju (za sekciju "ponuđene opcije")
  const getAll = (type: string): string => {
    const list = venues[type] || [];
    if (!list.length) return "  Nema pronađenih mjesta u odabranom radijusu";
    return list
      .map(
        (item, i) =>
          `  ${i + 1}. ${item.name}${item.address ? ` — ${item.address}` : ""}`,
      )
      .join("\n");
  };

  const COMPANION_LABELS: Record<CompanionType, string> = {
    solo: "samostalno putovanje",
    partner: "putovanje s partnerom",
    prijatelji: "putovanje s prijateljima",
    obitelj: "obiteljsko putovanje",
    misovito: "mješovita grupa",
  };
  const TRANSPORT_LABELS: Record<TransportType, string> = {
    auto: "autom",
    javni: "javnim prijevozom",
    pjesice: "pješice",
    bicikl: "biciklom",
  };

  const catLabels: Record<string, string> = {
    restaurant: "🍽️ Restorani",
    cafe: "☕ Kafići",
    club: "🎵 Noćni klubovi",
    beach: "🏖️ Plaže",
    landmark: "🏰 Znamenitosti",
    opg: "🌾 OPG",
    accommodation: "🏨 Smještaji",
    market: "🛒 Tržnice",
    paintball: "🎯 Paintball",
    cinema: "🎬 Kina",
    park: "🌳 Parkovi",
    escapeRoom: "🔐 Escape Roomovi",
    museum: "🏛️ Muzeji",
    theater: "🎭 Kazališta",
    mountain: "⛰️ Planine",
    nationalPark: "🏞️ Nacionalni parkovi",
    cave: "🕳️ Špilje",
    spa: "💧 Toplice/Spa",
  };

  let plan = `🗺️ PLAN PUTOVANJA — ${destination.toUpperCase()}`;
  if (postalCode) plan += ` ${postalCode}`;
  plan += `\n${"━".repeat(40)}\n`;
  plan += `📅 Trajanje: ${period === "dan" ? "1 dan" : period === "vikend" ? "Vikend (2 dana)" : period === "tjedan" ? "Tjedan (7 dana)" : period === "2tjedna" ? "Dva tjedna" : "Godišnji odmor (10 dana)"}\n`;
  plan += `👥 Putnici: ${people} osoba | ${COMPANION_LABELS[companions]}\n`;
  plan += `💰 Budžet: ${budget} EUR (~${perPerson} EUR/osobi/dan)\n`;
  plan += `🚗 Prijevoz: ${TRANSPORT_LABELS[transport]}\n`;
  plan += `📏 Radijus aktivnosti: ${activityRadius} km od smještaja\n`;
  if (accommodationAddress) plan += `🏨 Smještaj: ${accommodationAddress}\n`;
  plan += `\n`;

  // ✅ NOVA SEKCIJA: sve pronađene opcije po kategoriji
  // plan += `\n${"━".repeat(40)}\n`;
  // plan += `📋 PRONAĐENE OPCIJE PO KATEGORIJAMA (u radijusu ${activityRadius} km)\n`;
  // plan += `${"━".repeat(40)}\n`;

  // for (const [type, list] of Object.entries(venues)) {
  //   if (!list.length) continue;
  //   plan += `\n${catLabels[type] || type}:\n`;
  //   plan += `${getAll(type)}\n`;
  // }

  plan += `\n${"━".repeat(40)}\n`;
  plan += `📆 DNEVNI RASPORED\n`;
  plan += `${"━".repeat(40)}\n`;

  for (let d = 1; d <= Math.min(days, 7); d++) {
    plan += `\n${"─".repeat(36)}\n`;
    plan += `📆 ${t("plan.dayLabel")} ${d}\n`;
    plan += `${"─".repeat(36)}\n\n`;

    let cursor = 8 * 60; // 08:00
    const fmt = (m: number) => {
      const h = Math.floor(m / 60) % 24;
      const mm = m % 60;
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    const slot = (dur: number) => {
      const s = `${fmt(cursor)}–${fmt(cursor + dur)}`;
      cursor += dur + 15; // 15 min putovanje između
      return s;
    };

    // 08:00 – Doručak/kava
    // 08:00 – Doručak/kava
    plan += `🌅 ${t("plan.morningLabel")}\n`;
    const cafe = get("cafe", d - 1);
    if (cafe) plan += `  ☕ ${slot(45)} Doručak: ${cafe}\n`;
    else plan += `  ☕ ${slot(45)} Doručak u lokalnom kafiću\n`;

    // ~09:00 Jutarnja aktivnost 1
    if (preference !== "zatvoreno") {
      const landmark = get("landmark", d - 1);
      if (landmark) plan += `  🏰 ${slot(50)} Razgledavanje: ${landmark}\n`;
    }

    // ~10:00 Jutarnja aktivnost 2
    if (preference !== "zatvoreno") {
      const park = get("park", d - 1);
      if (park) plan += `  🌳 ${slot(45)} Šetnja: ${park}\n`;
    }

    // ~11:00 Jutarnja aktivnost 3 (zatvoreno/kombinirano)
    if (preference !== "otvoreno") {
      const museum = get("museum", d - 1);
      if (museum) plan += `  🏛️ ${slot(75)} Muzej: ${museum}\n`;
      else {
        const cafe2 = get("cafe", d % 2 === 0 ? d : d + 1);
        if (cafe2) plan += `  ☕ ${slot(30)} Kava/odmor: ${cafe2}\n`;
      }
    }

    // Ručak — bez forsiranog skoka, samo minimalni floor od 12:00
    if (cursor < 12 * 60) cursor = 12 * 60;
    plan += `☀️ ${t("plan.afternoonLabel")}\n`;
    const rest1 = get("restaurant", (d - 1) * 2);
    if (rest1) plan += `  🍽️ ${slot(75)} Ručak: ${rest1} (~20-35 EUR/os.)\n`;
    else
      plan += `  🍽️ ${slot(75)} Ručak u lokalnom restoranu (~20-35 EUR/os.)\n`;

    // ~13:30 Kratki odmor/kava poslije ručka (max 30 min)
    const cafeAfterLunch = get("cafe", (d + 2) % 3);
    if (cafeAfterLunch && companions !== "solo")
      plan += `  ☕ ${slot(30)} Kava poslije ručka: ${cafeAfterLunch}\n`;

    // ~14:00-14:30 Poslijepodnevna aktivnost 1
    if (preference !== "zatvoreno") {
      const beach = get("beach", d - 1);
      const natPark = get("nationalPark", d - 1);
      const cave = get("cave", d - 1);
      if (beach) plan += `  🏖️ ${slot(120)} Plaža: ${beach}\n`;
      else if (natPark) plan += `  🏞️ ${slot(120)} Nac. park: ${natPark}\n`;
      else if (cave) plan += `  🕳️ ${slot(75)} Špilja: ${cave}\n`;
      else {
        // fallback — šetnja ili park
        const park2 = get("park", d % 3);
        if (park2) plan += `  🌳 ${slot(60)} Popodnevna šetnja: ${park2}\n`;
      }
    }

    // ~15:30-16:00 Poslijepodnevna aktivnost 2
    if (preference !== "otvoreno") {
      const escapeRoom = get("escapeRoom", d - 1);
      const cinema = get("cinema", d - 1);
      const spa = get("spa", d - 1);
      const paintball = get("paintball", 0);

      if (escapeRoom && companions !== "solo")
        plan += `  🔐 ${slot(75)} Escape room: ${escapeRoom} (~20-30 EUR/os.)\n`;
      else if (cinema) plan += `  🎬 ${slot(110)} Kino: ${cinema}\n`;
      else if (spa && companions === "partner")
        plan += `  💧 ${slot(90)} Spa/toplice: ${spa}\n`;
      else if (
        paintball &&
        (companions === "prijatelji" || companions === "misovito")
      )
        plan += `  🎯 ${slot(90)} Paintball: ${paintball} (~25-40 EUR/os.)\n`;
    }

    // Ako je ostalo slobodnog vremena, popuni tržnicom ili OPG-om
    const market = get("market", d - 1);
    const opg = get("opg", d - 1);
    if (market && cursor < 17 * 60)
      plan += `  🛒 ${slot(40)} Tržnica/suveniri: ${market}\n`;
    if (opg && companions === "obitelj" && cursor < 17 * 60)
      plan += `  🌾 ${slot(60)} OPG posjet: ${opg}\n`;

    // Slobodno popodne/odmor u smještaju — ako je cursor < 18:00
    if (cursor < 17 * 60 + 30) {
      plan += `  🏨 ${slot(Math.max(30, 17 * 60 + 30 - cursor))} Odmor u smještaju\n`;
    }

    // Večera — floor 18:30 (ne 19:00 jer gubimo čitav sat)
    if (cursor < 18 * 60 + 30) cursor = 18 * 60 + 30;
    plan += `🌙 ${t("plan.eveningLabel")}\n`;
    const rest2 = get("restaurant", (d - 1) * 2 + 1);
    if (rest2) plan += `  🍷 ${slot(75)} Večera: ${rest2} (~30-55 EUR/os.)\n`;
    else plan += `  🍷 ${slot(75)} Večera (~30-55 EUR/os.)\n`;

    // ~20:00 Noćna aktivnost
    if (companions !== "obitelj" && companions !== "solo") {
      const club = get("club", d - 1);
      const theater = get("theater", d - 1);
      if (theater && d % 3 === 0)
        plan += `  🎭 ${slot(120)} Kazalište: ${theater}\n`;
      else if (club) plan += `  🎵 ${slot(180)} Noćni klub: ${club}\n`;
    } else if (companions === "obitelj") {
      // Obitelji — večernja šetnja ili kava
      const park3 = get("park", (d + 1) % 3);
      if (park3) plan += `  🌃 ${slot(45)} Večernja šetnja: ${park3}\n`;
    }

    plan += `\n💰 Procijenjeni troškovi dana: ~${dayBudget} EUR (~${perPerson} EUR/os.)\n`;
  }

  // Alternativne opcije za svaki dan
  if (Object.keys(venues).length > 0) {
    plan += `\n${"━".repeat(40)}\n`;
    plan += `🔄 ALTERNATIVNE OPCIJE\n`;
    plan += `${"━".repeat(40)}\n`;
    plan += `Sva pronađena mjesta dostupna su na karti - kliknite marker za detalje, ocjene i mogućnost označavanja posjete.\n`;
  }

  // Savjeti
  plan += `\n${"━".repeat(40)}\n`;
  plan += `💡 ${t("plan.tipsLabel")}\n`;
  plan += `${"━".repeat(40)}\n`;
  if (transport === "javni")
    plan += `• Prijevozni raspored: hzpp.hr / arriva.hr / getbybus.com\n`;
  if (transport === "auto")
    plan += `• Parkirajte u garaži smještaja — lakše za dulje izlete\n`;
  if (transport === "pjesice")
    plan += `• Nosite udobnu obuću — centri starih gradova su bogati šetnicama\n`;
  plan += `• Rezervirajte restorane unaprijed (posebno u ljetnoj sezoni)\n`;
  if (preference !== "zatvoreno")
    plan += `• Nosite kremu za sunce i vodu za aktivnosti na otvorenom\n`;
  if (companions === "obitelj")
    plan += `• Provjerite ulaznice za djecu — često su besplatne do 7 god.\n`;
  plan += `\n✨ Ugodan boravak u ${destination}!\n`;
  plan += `\n📌 Napomena: konkretni prijedlozi mjesta generirani su iz OpenStreetMap podataka. Preporučujemo provjeru radnog vremena pred polazak. Kliknite marker na karti za Google Photos, radno vrijeme i mogućnost ocjenjivanja.`;

  return plan;
}
// PlaceDetailInPlan komponenta - dodajte prije PlanMyDayModal
function PlaceDetailInPlan({
  place,
}: {
  place: { name: string; latitude: number; longitude: number; type: string };
}) {
  const { t } = useTranslation();
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGoogleDetails(place.name, place.latitude, place.longitude)
      .then((d) => {
        setDetails(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [place.name, place.latitude, place.longitude]);

  if (loading) return <ActivityIndicator color={V.visited} />;

  return (
    <ScrollView>
      {details?.photos?.[0] && (
        <Image
          source={{ uri: details.photos[0] }}
          style={{
            width: "100%",
            height: 180,
            borderRadius: 12,
            marginBottom: 12,
          }}
          resizeMode="cover"
        />
      )}
      {details?.rating && (
        <Text style={{ color: "#ff9500", marginBottom: 4 }}>
          ⭐ {details.rating.toFixed(1)} / 5
        </Text>
      )}
      {details?.openingHours && (
        <View
          style={{
            backgroundColor: "#f5f5f5",
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontWeight: "700", marginBottom: 4 }}>
            🕐 {t("map.openingHours")}
          </Text>
          <Text style={{ fontSize: T.meta, color: "#555" }}>
            {details.openingHours}
          </Text>
        </View>
      )}
      {details?.phone && (
        <Text style={{ color: "#666", marginBottom: 4 }}>
          📞 {details.phone}
        </Text>
      )}
    </ScrollView>
  );
}

// const pm = StyleSheet.create({
//   header: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     padding: 16,
//     paddingTop: Platform.OS === "ios" ? 54 : 36,
//     borderBottomWidth: 1,
//     borderBottomColor: "#eee",
//     backgroundColor: "#fff",
//   },
//   headerTitle: { fontSize: T.lead, fontWeight: "700", color: "#1a1a1a" },
//   headerLink: {
//     fontSize: T.body,
//     color: "#667eea",
//     fontWeight: "600",
//     minWidth: 60,
//   },
//   sectionTitle: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: "#1a1a1a",
//     marginBottom: 10,
//     marginTop: 20,
//   },
//   label: { fontSize: T.meta, color: "#666", marginBottom: 8 },
//   input: {
//     backgroundColor: "#f5f5f5",
//     borderRadius: 12,
//     padding: 12,
//     fontSize: T.body,
//     color: "#333",
//     marginBottom: 10,
//     borderWidth: 1,
//     borderColor: "#e8e8e8",
//   },
//   row: { flexDirection: "row", marginBottom: 0 },
//   chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
//   chip: {
//     paddingHorizontal: 14,
//     paddingVertical: 9,
//     borderRadius: 20,
//     backgroundColor: "#f0f0f0",
//   },
//   chipSmall: {
//     paddingHorizontal: 12,
//     paddingVertical: 7,
//     borderRadius: 18,
//     backgroundColor: "#f0f0f0",
//   },
//   chipMd: {
//     paddingHorizontal: 14,
//     paddingVertical: 8,
//     borderRadius: 14,
//     backgroundColor: "#f0f0f0",
//     alignItems: "center",
//     minWidth: 64,
//   },
//   chipActive: { backgroundColor: "#667eea" },
//   chipText: { fontSize: T.meta, fontWeight: "600", color: "#555" },
//   chipTextActive: { color: "#fff" },
//   generateBtn: {
//     backgroundColor: "#667eea",
//     borderRadius: 16,
//     paddingVertical: 18,
//     alignItems: "center",
//     marginTop: 8,
//   },
//   generateBtnText: { color: "#fff", fontSize: T.lead, fontWeight: "700" },
//   generateHint: {
//     textAlign: "center",
//     fontSize: T.meta,
//     color: "#999",
//     marginTop: 10,
//   },
//   loadingContainer: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     padding: 40,
//   },
//   loadingIcon: { fontSize: 64, marginTop: 24, marginBottom: 8 },
//   loadingText: {
//     fontSize: T.title,
//     fontWeight: "700",
//     color: "#1a1a1a",
//     textAlign: "center",
//   },
//   loadingHint: {
//     fontSize: T.meta,
//     color: "#999",
//     marginTop: 8,
//     textAlign: "center",
//   },
//   resultBadge: {
//     backgroundColor: "#f0f0ff",
//     borderRadius: 10,
//     paddingHorizontal: 14,
//     paddingVertical: 8,
//     marginBottom: 16,
//     alignSelf: "flex-start",
//   },
//   resultBadgeText: { fontSize: T.meta, color: "#667eea", fontWeight: "600" },
//   resultText: {
//     fontSize: T.meta,
//     color: "#333",
//     lineHeight: 22,
//     fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
//   },
//   btnPrimary: {
//     backgroundColor: "#667eea",
//     borderRadius: 14,
//     paddingVertical: 14,
//     alignItems: "center",
//   },
//   btnPrimaryText: { color: "#fff", fontSize: T.body, fontWeight: "700" },
//   btnSecondary: {
//     borderRadius: 14,
//     paddingVertical: 14,
//     alignItems: "center",
//     borderWidth: 1.5,
//     borderColor: "#667eea",
//   },
//   btnSecondaryText: { color: "#667eea", fontSize: T.body, fontWeight: "600" },
// });

function PlanRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const rendered: React.ReactElement[] = [];
  let metaLines: string[] = [];
  let inMeta = false;

  const flushMeta = (key: string) => {
    if (metaLines.length === 0) return;
    rendered.push(
      <View key={`meta-${key}`} style={pr.metaCard}>
        {metaLines.map((ml, mi) => (
          <View key={mi} style={pr.metaRow}>
            <Text style={pr.metaText}>{ml}</Text>
          </View>
        ))}
      </View>,
    );
    metaLines = [];
    inMeta = false;
  };

  lines.forEach((line, i) => {
    const t = line.trim();

    if (!t) {
      flushMeta(String(i));
      rendered.push(<View key={i} style={{ height: 4 }} />);
      return;
    }
    // Skip separator lines
    if (/^[━─=]{3,}/.test(t)) return;

    // ── Title ─────────────────────────────────────────────────────────────────
    if (t.startsWith("🗺️")) {
      flushMeta(String(i));
      const dest = t
        .replace("🗺️ PLAN PUTOVANJA", "")
        .replace("—", "")
        .replace("–", "")
        .trim();
      rendered.push(
        <View key={i} style={pr.titleBox}>
          <Text style={pr.titleEmoji}>🗺️</Text>
          <View style={{ flex: 1 }}>
            <Text style={pr.titleSub}>PLAN PUTOVANJA</Text>
            <Text style={pr.titleMain}>{dest || "Vaša destinacija"}</Text>
          </View>
        </View>,
      );
      inMeta = true;
      return;
    }

    // ── Meta block (collect into card) ────────────────────────────────────────
    if (inMeta && /^[📅👥🚗📏🏨]/.test(t)) {
      metaLines.push(t);
      return;
    }
    if (inMeta && t.startsWith("💰") && !t.includes("Procijenjeni")) {
      metaLines.push(t);
      return;
    }

    // ── Day header ────────────────────────────────────────────────────────────
    if (t.startsWith("📆")) {
      flushMeta(String(i));
      rendered.push(
        <View key={i} style={pr.dayCard}>
          <Text style={pr.dayText}>{t}</Text>
        </View>,
      );
      return;
    }

    // ── Time blocks ───────────────────────────────────────────────────────────
    if (t.startsWith("🌅")) {
      flushMeta(String(i));
      rendered.push(
        <View
          key={i}
          style={[
            pr.timeBlock,
            { borderLeftColor: "#ff9500", backgroundColor: "#fff8f0" },
          ]}
        >
          <Text style={[pr.timeText, { color: "#e67e00" }]}>{t}</Text>
        </View>,
      );
      return;
    }
    if (t.startsWith("☀️")) {
      flushMeta(String(i));
      rendered.push(
        <View
          key={i}
          style={[
            pr.timeBlock,
            { borderLeftColor: "#f0c040", backgroundColor: "#fffdf0" },
          ]}
        >
          <Text style={[pr.timeText, { color: "#a07800" }]}>{t}</Text>
        </View>,
      );
      return;
    }
    if (t.startsWith("🌙")) {
      flushMeta(String(i));
      rendered.push(
        <View
          key={i}
          style={[
            pr.timeBlock,
            { borderLeftColor: "#5856D6", backgroundColor: "#f5f0ff" },
          ]}
        >
          <Text style={[pr.timeText, { color: "#5856D6" }]}>{t}</Text>
        </View>,
      );
      return;
    }

    // ── Cost estimate ─────────────────────────────────────────────────────────
    if (t.includes("Procijenjeni")) {
      flushMeta(String(i));
      rendered.push(
        <View key={i} style={pr.costBox}>
          <Text style={pr.costText}>{t}</Text>
        </View>,
      );
      return;
    }

    // ── Tips header ───────────────────────────────────────────────────────────
    if (t.startsWith("💡")) {
      flushMeta(String(i));
      rendered.push(
        <View key={i} style={pr.tipsHeader}>
          <Text style={pr.tipsTitle}>{t}</Text>
        </View>,
      );
      return;
    }

    // ── Tip bullets ───────────────────────────────────────────────────────────
    if (t.startsWith("•")) {
      rendered.push(
        <View key={i} style={pr.tipRow}>
          <Text style={pr.tipDot}>›</Text>
          <Text style={pr.tipText}>{t.slice(1).trim()}</Text>
        </View>,
      );
      return;
    }

    // ── Note / disclaimer ─────────────────────────────────────────────────────
    if (t.startsWith("📌")) {
      flushMeta(String(i));
      rendered.push(
        <View key={i} style={pr.noteBox}>
          <Text style={pr.noteText}>{t}</Text>
        </View>,
      );
      return;
    }

    // ── Closing ───────────────────────────────────────────────────────────────
    if (t.startsWith("✨")) {
      flushMeta(String(i));
      rendered.push(
        <View key={i} style={pr.closingBox}>
          <Text style={pr.closingText}>{t}</Text>
        </View>,
      );
      return;
    }

    // ── Activity item (default) ───────────────────────────────────────────────
    flushMeta(String(i));
    rendered.push(
      <View key={i} style={pr.activityCard}>
        <Text style={pr.activityText}>{t}</Text>
      </View>,
    );
  });

  flushMeta("end");
  return <View style={pr.container}>{rendered}</View>;
}

// const pr = StyleSheet.create({
//   container: { gap: 3, paddingBottom: 8 },

//   // Title card — gradient purple
//   titleBox: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 14,
//     backgroundColor: "#667eea",
//     borderRadius: 18,
//     padding: 18,
//     marginBottom: 10,
//     shadowColor: "#667eea",
//     shadowOffset: { width: 0, height: 6 },
//     shadowOpacity: 0.35,
//     shadowRadius: 10,
//     elevation: 7,
//   },
//   titleEmoji: { fontSize: T.hero },
//   titleSub: {
//     color: "rgba(255,255,255,0.7)",
//     fontSize: 10,
//     fontWeight: "700",
//     letterSpacing: 1.8,
//     marginBottom: 2,
//   },
//   titleMain: { color: "#fff", fontSize: T.title, fontWeight: "900", lineHeight: 26 },

//   // Meta info card
//   metaCard: {
//     backgroundColor: "#f7f8ff",
//     borderRadius: 14,
//     padding: 14,
//     marginBottom: 4,
//     borderWidth: 1,
//     borderColor: "#eaedff",
//     gap: 6,
//   },
//   metaRow: { flexDirection: "row" },
//   metaText: { fontSize: T.meta, color: "#444", lineHeight: 21, flex: 1 },

//   // Day card — blue-left border
//   dayCard: {
//     backgroundColor: "#eef1ff",
//     borderRadius: 14,
//     paddingVertical: 13,
//     paddingHorizontal: 16,
//     marginTop: 20,
//     marginBottom: 8,
//     borderLeftWidth: 5,
//     borderLeftColor: "#667eea",
//     shadowColor: "#667eea",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.12,
//     shadowRadius: 6,
//     elevation: 3,
//   },
//   dayText: { fontSize: T.lead, fontWeight: "900", color: "#222" },

//   // Time blocks
//   timeBlock: {
//     borderRadius: 10,
//     borderLeftWidth: 4,
//     paddingVertical: 10,
//     paddingHorizontal: 14,
//     marginTop: 12,
//     marginBottom: 4,
//   },
//   timeText: { fontSize: T.body, fontWeight: "700" },

//   // Activity items
//   activityCard: {
//     backgroundColor: "#fff",
//     borderRadius: 10,
//     paddingVertical: 9,
//     paddingHorizontal: 14,
//     marginLeft: 12,
//     marginVertical: 2,
//     borderWidth: 1,
//     borderColor: "#f0f2f5",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.04,
//     shadowRadius: 3,
//     elevation: 1,
//   },
//   activityText: { fontSize: T.meta, color: "#333", lineHeight: 20 },

//   // Cost estimate
//   costBox: {
//     backgroundColor: "#fff8e6",
//     borderRadius: 10,
//     padding: 12,
//     marginTop: 10,
//     marginLeft: 12,
//     borderLeftWidth: 4,
//     borderLeftColor: "#ff9500",
//   },
//   costText: { fontSize: T.meta, color: "#8a5c00", fontWeight: "700" },

//   // Tips section
//   tipsHeader: {
//     backgroundColor: "#e8f5e9",
//     borderRadius: 14,
//     padding: 16,
//     marginTop: 24,
//     borderLeftWidth: 5,
//     borderLeftColor: "#34c759",
//   },
//   tipsTitle: { fontSize: T.lead, fontWeight: "800", color: "#1b5e20" },
//   tipRow: {
//     flexDirection: "row",
//     paddingVertical: 6,
//     paddingLeft: 14,
//     gap: 8,
//     alignItems: "flex-start",
//   },
//   tipDot: { fontSize: T.title, color: "#34c759", fontWeight: "800", lineHeight: 22 },
//   tipText: { fontSize: T.meta, color: "#333", lineHeight: 22, flex: 1 },

//   // Note
//   noteBox: {
//     backgroundColor: "#e8f4fd",
//     borderRadius: 12,
//     padding: 14,
//     marginTop: 18,
//     borderLeftWidth: 4,
//     borderLeftColor: "#2196f3",
//   },
//   noteText: { fontSize: T.meta, color: "#0d47a1", lineHeight: 18 },

//   // Closing
//   closingBox: {
//     backgroundColor: "#f0f9f4",
//     borderRadius: 12,
//     padding: 14,
//     marginTop: 12,
//     alignItems: "center",
//     borderWidth: 1,
//     borderColor: "#c8e6c9",
//   },
//   closingText: {
//     fontSize: T.body,
//     color: "#2D6418",
//     fontWeight: "700",
//     textAlign: "center",
//   },
// });

function venueToPlace(
  venue: {
    name: string;
    address?: string;
    latitude: number;
    longitude: number;
  },
  type: string,
): Place {
  return {
    id: `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`,
    name: venue.name,
    latitude: venue.latitude,
    longitude: venue.longitude,
    type: type as Place["type"],
    address: venue.address,
    distance: 0,
  };
}

// PLAN MY DAY MODAL

// export function PlanMyDayModal({
//   visible,
//   userLocation,
//   onClose,
//   onMarkVisited,
//   visits = [],
// }: {
//   visible: boolean;
//   userLocation: { latitude: number; longitude: number } | null;
//   onClose: () => void;
//   onMarkVisited?: (place: Place) => Promise<void>;
//   visits?: VisitRecord[];
// }) {
//   const { t } = useTranslation();
//   const { isDark } = useTheme();
//   const DC = getDashColors(isDark);
//   const getAllCategories = useCallback(() => {
//     return Object.entries(placeCategories).map(([id, c]) => ({
//       id,
//       name: t(`categories.${id}`, { defaultValue: id }),
//       icon: EMOJIS[id] || "📍",
//       color: c.color,
//     }));
//   }, [t]);

//   const LOADING_MESSAGES = [
//     { icon: "🌍", text: t("plan.loading1") },
//     { icon: "📍", text: t("plan.loading2") },
//     { icon: "🍽️", text: t("plan.loading3") },
//     { icon: "🏖️", text: t("plan.loading4") },
//     { icon: "🗺️", text: t("plan.loading5") },
//     { icon: "✨", text: t("plan.loading6") },
//   ];

//   const [step, setStep] = useState<PlanStep>("form");
//   const [destination, setDestination] = useState("");
//   const [mapMarkerLimit, setMapMarkerLimit] = useState(10);
//   const [postalCode, setPostalCode] = useState("");
//   const [accommodationAddress, setAccommodationAddress] = useState("");
//   const [period, setPeriod] = useState<PlanPeriod>("vikend");
//   const [people, setPeople] = useState("2");
//   const [companions, setCompanions] = useState<CompanionType>("prijatelji");
//   const [budget, setBudget] = useState("500");
//   const [activityRadius, setActivityRadius] = useState(3);
//   const [transport, setTransport] = useState<TransportType>("auto");
//   const [preference, setPreference] = useState<PreferenceType>("kombinirano");
//   const [interests, setInterests] = useState<string[]>([]);
//   const [result, setResult] = useState("");
//   const [dayRoutes, setDayRoutes] = useState<DayRoute[]>([]);
//   const [activeRoute, setActiveRoute] = useState(0);
//   const [planRating, setPlanRating] = useState(0);
//   const [chosenRoute, setChosenRoute] = useState<string | null>(null);
//   const [ratingSaved, setRatingSaved] = useState(false);
//   const [savingRating, setSavingRating] = useState(false);
//   const [loadingStep, setLoadingStep] = useState(0);

//   // ── Modal za detalje mjesta (klik na marker ili na karticu) ──────────────
//   const [selectedPlaceForDetail, setSelectedPlaceForDetail] =
//     useState<Place | null>(null);
//   const [showDetailModal, setShowDetailModal] = useState(false);

//   // ── Lokalni popis posjeta unutar plana ──────────────────────────────────
//   // (sinkronizira se s parent visits propsima + lokalnim optimističnim updateom)
//   const [localVisitedIds, setLocalVisitedIds] = useState<Set<string>>(
//     new Set(),
//   );

//   const mapRef = useRef<MapView>(null);
//   const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
//   const [selectedVenues, setSelectedVenues] = useState<Record<string, number>>(
//     {},
//   );
//   const [allVenues, setAllVenues] = useState<
//     Record<
//       string,
//       { name: string; address?: string; latitude: number; longitude: number }[]
//     >
//   >({});
//   const [accommodationCoords, setAccommodationCoords] = useState<{
//     latitude: number;
//     longitude: number;
//   } | null>(null);

//   // Sinkroniziraj parent visits u lokalni set
//   useEffect(() => {
//     const ids = new Set<string>(visits.map((v) => v.placeId));
//     setLocalVisitedIds(ids);
//   }, [visits]);

//   const reset = () => {
//     setStep("form");
//     setResult("");
//     setDestination("");
//     setPostalCode("");
//     setAccommodationAddress("");
//     setInterests([]);
//     setAllVenues({});
//     setSelectedVenues({});
//     setMapMarkerLimit(10);
//     setAccommodationCoords(null);
//     if (loadingInterval.current) clearInterval(loadingInterval.current);
//   };

//   const handleClose = () => {
//     reset();
//     onClose();
//   };

//   const toggleInterest = (id: string) =>
//     setInterests((p) =>
//       p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
//     );

//   // ── Označi posjet iz plana ────────────────────────────────────────────────
//   const handleMarkVisitedFromPlan = async (
//     venue: {
//       name: string;
//       address?: string;
//       latitude: number;
//       longitude: number;
//     },
//     type: string,
//   ) => {
//     const placeId = `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`;
//     const place: Place = {
//       id: placeId,
//       name: venue.name,
//       latitude: venue.latitude,
//       longitude: venue.longitude,
//       type: type as Place["type"],
//       address: venue.address,
//     };

//     if (localVisitedIds.has(placeId)) {
//       Alert.alert("ℹ️ Već posjećeno", `"${venue.name}" je već u vašoj arhivi.`);
//       return;
//     }

//     // Optimistički update
//     setLocalVisitedIds((prev) => new Set([...prev, placeId]));

//     if (onMarkVisited) {
//       await onMarkVisited(place);
//     }
//   };

//   const isVenueVisited = (
//     venue: { name: string; latitude: number; longitude: number },
//     type: string,
//   ) => {
//     const placeId = `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`;
//     // Provjeri i po ID-u i po imenu (za mjesta dodana s glavne karte)
//     return (
//       localVisitedIds.has(placeId) ||
//       visits.some(
//         (v) =>
//           v.placeName.toLowerCase() === venue.name.toLowerCase() &&
//           v.placeType === type,
//       )
//     );
//   };

//   const generate = async () => {
//     if (!destination.trim()) {
//       Alert.alert(t("plan.destination"), t("plan.destinationRequired"));
//       return;
//     }
//     setLoadingStep(0);
//     setStep("loading");

//     loadingInterval.current = setInterval(() => {
//       setLoadingStep((prev) => (prev + 1) % LOADING_MESSAGES.length);
//     }, 2200);

//     try {
//       const query = [destination.trim(), postalCode.trim(), "Hrvatska"]
//         .filter(Boolean)
//         .join(" ");

//       const { geocoded, venues } = await fetchVenuesNearCity(
//         query,
//         activityRadius,
//         interests,
//       );

//       setAllVenues(venues);
//       const routes = generateDayRoutes(venues);
//       setDayRoutes(routes);
//       setActiveRoute(0);

//       if (accommodationAddress.trim() && geocoded) {
//         const accommodationResult = await geocodeCity(
//           `${accommodationAddress}, ${destination}`,
//         );
//         setAccommodationCoords(
//           accommodationResult
//             ? {
//                 latitude: accommodationResult.latitude,
//                 longitude: accommodationResult.longitude,
//               }
//             : { latitude: geocoded.latitude, longitude: geocoded.longitude },
//         );
//       } else if (geocoded) {
//         setAccommodationCoords({
//           latitude: geocoded.latitude,
//           longitude: geocoded.longitude,
//         });
//       }

//       if (loadingInterval.current) clearInterval(loadingInterval.current);
//       setLoadingStep(5);

//       const token = await getToken();
//       let text = "";

//       const venueStr = Object.entries(venues)
//         .map(([type, items]) => {
//           const label = type;
//           return `${label} (${items.length} opcija): ${items
//             .map(
//               (i, idx) =>
//                 `${idx + 1}. ${i.name}${i.address ? ` (${i.address})` : ""}`,
//             )
//             .join(", ")}`;
//         })
//         .join("\n");

//       const prompt = `Napravi detaljan plan putovanja na hrvatskom jeziku:
// 📍 Destinacija: ${destination}${postalCode ? ` (${postalCode})` : ""}
// 🏨 Smještaj: ${accommodationAddress || "nije određen"}
// 📅 Trajanje: ${period}
// 👥 Putnici: ${people} osoba (${companions})
// 💰 Budžet: ${budget} EUR
// 🚗 Prijevoz: ${transport}
// 🌿 Preferencija: ${preference}
// 📏 Radijus od smještaja: ${activityRadius} km

// Pronađena stvarna mjesta — za svaku kategoriju odaberi MIN 5 konkretnih:
// ${venueStr || "Nema pronađenih mjesta, koristi opće prijedloge"}

// Plan napiši po danima, OBAVEZNO koristi konkretna imena mjesta, adrese, procjene troška. Piši na hrvatskom.`;

//       try {
//         const resp = await fetch(`${API_BASE_URL}/api/ai/plan`, {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//           body: JSON.stringify({ prompt }),
//         });
//         if (resp.ok) {
//           const data = await resp.json();
//           text = data.result || data.text || "";
//         }
//       } catch {
//         /* AI nije dostupan, idemo na template */
//       }

//       if (!text) {
//         text = buildPlanWithVenues(
//           destination,
//           postalCode,
//           accommodationAddress,
//           period,
//           people,
//           companions,
//           budget,
//           activityRadius,
//           transport,
//           preference,
//           interests,
//           venues,
//         );
//       }

//       setResult(text);
//       setStep("result");
//     } catch (e) {
//       if (loadingInterval.current) clearInterval(loadingInterval.current);
//       Alert.alert(t("common.error"), t("plan.planError"));
//       setStep("form");
//     }
//   };

//   const copyPlan = () => {
//     Share.share({ message: result }).catch(() =>
//       Alert.alert(t("common.error"), t("plan.shareFailed")),
//     );
//   };

//   const PERIOD_OPTIONS: { key: PlanPeriod; labelKey: string }[] = [
//     { key: "dan", labelKey: "plan.day1" },
//     { key: "vikend", labelKey: "plan.weekend" },
//     { key: "tjedan", labelKey: "plan.week" },
//     { key: "2tjedna", labelKey: "plan.twoWeeks" },
//     { key: "godisnji", labelKey: "plan.vacation" },
//   ];
//   const COMPANION_OPTIONS: {
//     key: CompanionType;
//     labelKey: string;
//     icon: string;
//     image: any;
//   }[] = [
//     { key: "solo", labelKey: "plan.solo", icon: "🧑", image: soloIcon },
//     {
//       key: "partner",
//       labelKey: "plan.partner",
//       icon: "💑",
//       image: partnerIcon,
//     },
//     {
//       key: "prijatelji",
//       labelKey: "plan.friends",
//       icon: "👫",
//       image: prijateljIcon,
//     },
//     { key: "obitelj", labelKey: "plan.family", icon: "👨‍👩‍👧", image: obiteljIcon },
//     {
//       key: "misovito",
//       labelKey: "plan.mixed",
//       icon: "🎉",
//       image: mjesovitIcon,
//     },
//   ];
//   const TRANSPORT_OPTIONS: {
//     key: TransportType;
//     labelKey: string;
//     icon: string;
//     image: any;
//   }[] = [
//     { key: "auto", labelKey: "plan.car", icon: "🚗", image: autoIcon },
//     { key: "javni", labelKey: "plan.public", icon: "🚌", image: javniIcon },
//     {
//       key: "pjesice",
//       labelKey: "plan.walking",
//       icon: "🚶",
//       image: pjesiceIcon,
//     },
//     { key: "bicikl", labelKey: "plan.bicycle", icon: "🚲", image: biciklIcon },
//   ];
//   const PREF_OPTIONS: {
//     key: PreferenceType;
//     labelKey: string;
//     icon: string;
//     image: any;
//   }[] = [
//     {
//       key: "otvoreno",
//       labelKey: "plan.outdoors",
//       icon: "🌞",
//       image: otvorenIcon,
//     },
//     {
//       key: "zatvoreno",
//       labelKey: "plan.indoors",
//       icon: "🏠",
//       image: zatvorenoIcon,
//     },
//     {
//       key: "kombinirano",
//       labelKey: "plan.combined",
//       icon: "🌤️",
//       image: kombiniranoIcon,
//     },
//   ];

//   // Statistike za header u result viewu
//   const totalVenues = Object.values(allVenues).reduce(
//     (sum, arr) => sum + arr.length,
//     0,
//   );
//   const visitedCount = Object.entries(allVenues).reduce(
//     (sum, [type, venues]) => {
//       return sum + venues.filter((v) => isVenueVisited(v, type)).length;
//     },
//     0,
//   );

//   return (
//     <Modal
//       visible={visible}
//       animationType="slide"
//       transparent={false}
//       onRequestClose={handleClose}
//     >
//       <View style={{ flex: 1, backgroundColor: DC.bg }}>
//         {/* ── Header ────────────────────────────────────────────────── */}
//         {/* NOVO */}
//         <View
//           style={{
//             flexDirection: "row",
//             justifyContent: "space-between",
//             alignItems: "center",
//             padding: 20,
//             paddingTop: Platform.OS === "ios" ? 54 : 36,
//             borderBottomWidth: 1.5,
//             borderBottomColor: DC.border,
//             backgroundColor: DC.bg,
//           }}
//         >
//           {step === "result" ? (
//             <TouchableOpacity onPress={() => setStep("form")}>
//               <Text
//                 style={{ fontSize: T.lead, color: DC.accent, fontWeight: "700" }}
//               >
//                 Novi plan
//               </Text>
//             </TouchableOpacity>
//           ) : (
//             <Text style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}>
//               {step === "loading" ? t("map.generatingPlan") : t("map.planTrip")}
//             </Text>
//           )}

//           {step === "result" && (
//             <Text style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}>
//               {t("map.tripPlan")}
//             </Text>
//           )}

//           {step === "result" ? (
//             <TouchableOpacity onPress={copyPlan}>
//               <Text
//                 style={{ fontSize: T.body, color: DC.textDim, fontWeight: "600" }}
//               >
//                 📋 {t("common.copy")}
//               </Text>
//             </TouchableOpacity>
//           ) : step === "loading" ? (
//             <View style={{ width: 60 }} />
//           ) : (
//             <TouchableOpacity onPress={handleClose}>
//               <Text
//                 style={{ fontSize: T.body, color: DC.textDim, fontWeight: "600" }}
//               >
//                 {t("common.close")}
//               </Text>
//             </TouchableOpacity>
//           )}
//         </View>

//         {/* ── LOADING ───────────────────────────────────────────────── */}
//         {step === "loading" && (
//           <View style={[pm.loadingContainer, { backgroundColor: DC.bg }]}>
//             <ActivityIndicator size="large" color="#667eea" />
//             <Text style={pm.loadingIcon}>
//               {LOADING_MESSAGES[loadingStep].icon}
//             </Text>
//             <Text style={pm.loadingText}>
//               {LOADING_MESSAGES[loadingStep].text}
//             </Text>
//             <ProgressBar step={loadingStep} total={LOADING_MESSAGES.length} />
//             <Text style={pm.loadingHint}>
//               {t("plan.fetchingPlacesFrom", { destination })}
//             </Text>
//           </View>
//         )}

//         {/* ── RESULT ───────────────────────────────────────────────── */}
//         {step === "result" && (
//           <ScrollView
//             contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
//           >
//             {/* Progress */}
//             {/* <View style={planStyles.progressCard}>
//               <View style={planStyles.progressHeader}>
//                 <Text style={planStyles.progressTitle}>
//                   📊 Napredak putovanja
//                 </Text>
//                 <Text style={planStyles.progressCount}>
//                   {visitedCount} / {totalVenues} posjećeno
//                 </Text>
//               </View>
//               <View style={planStyles.progressTrack}>
//                 <View
//                   style={[
//                     planStyles.progressFill,
//                     {
//                       width:
//                         totalVenues > 0
//                           ? `${Math.round((visitedCount / totalVenues) * 100)}%`
//                           : "0%",
//                     },
//                   ]}
//                 />
//               </View>
//               {visitedCount > 0 && (
//                 <Text style={planStyles.progressHint}>
//                   🏆 Odlično! Posjetili ste {visitedCount} preporučenih mjesta.
//                 </Text>
//               )}
//             </View> */}

//             {/* KARTA — s korisnikovom lokacijom i svim kategorijama */}
//             <View style={mapLegend.header}>
//               <View style={{ flex: 1 }}>
//                 <Text style={mapLegend.headerTitle}>
//                   {t("map.destinationMap")}
//                 </Text>
//                 <Text style={mapLegend.headerSub}>
//                   {accommodationAddress
//                     ? `🏨 ${accommodationAddress}`
//                     : "Tapnite marker za detalje"}
//                 </Text>
//               </View>
//               {accommodationCoords && (
//                 <TouchableOpacity
//                   style={mapLegend.recenterBtn}
//                   onPress={() =>
//                     mapRef.current?.animateToRegion(
//                       {
//                         latitude: accommodationCoords.latitude,
//                         longitude: accommodationCoords.longitude,
//                         latitudeDelta: 0.05,
//                         longitudeDelta: 0.05,
//                       },
//                       800,
//                     )
//                   }
//                 >
//                   <Text style={{ fontSize: T.title }}>🎯</Text>
//                 </TouchableOpacity>
//               )}
//             </View>

//             {(() => {
//               const allMapVenues: {
//                 venue: {
//                   name: string;
//                   address?: string;
//                   latitude: number;
//                   longitude: number;
//                 };
//                 type: string;
//               }[] = [];
//               Object.entries(allVenues).forEach(([type, options]) => {
//                 options.forEach((venue) => allMapVenues.push({ venue, type }));
//               });
//               const visibleVenues = allMapVenues.slice(0, mapMarkerLimit);
//               const hasMoreMarkers = allMapVenues.length > mapMarkerLimit;
//               const moreCount = Math.min(
//                 allMapVenues.length - mapMarkerLimit,
//                 10,
//               );

//               return (
//                 <>
//                   <MapView
//                     ref={mapRef}
//                     style={{ height: 480, borderRadius: 16, marginBottom: 0 }}
//                     initialRegion={{
//                       latitude: accommodationCoords?.latitude || 45.815,
//                       longitude: accommodationCoords?.longitude || 15.9819,
//                       latitudeDelta: 0.06,
//                       longitudeDelta: 0.06,
//                     }}
//                   >
//                     {userLocation && (
//                       <Marker
//                         coordinate={userLocation}
//                         anchor={{ x: 0.5, y: 0.5 }}
//                         tracksViewChanges={false}
//                       >
//                         <UserLocationMarker />
//                       </Marker>
//                     )}
//                     {accommodationCoords && (
//                       <Marker
//                         coordinate={accommodationCoords}
//                         title="🏨 Vaš smještaj"
//                         description={accommodationAddress || "Adresa smještaja"}
//                         pinColor="#667eea"
//                       />
//                     )}

//                     {/* RUTE PO DANIMA — svaki dan ima svoju boju, markeri s rednim brojem */}
//                     {(() => {
//                       const DAYS_COUNT = Math.min(
//                         {
//                           dan: 1,
//                           vikend: 2,
//                           tjedan: 7,
//                           "2tjedna": 14,
//                           godisnji: 10,
//                         }[period] || 1,
//                         7,
//                       );
//                       const DAY_COLORS = [
//                         "#e74c3c",
//                         "#2ecc71",
//                         "#3498db",
//                         "#f39c12",
//                         "#9b59b6",
//                         "#1abc9c",
//                         "#e67e22",
//                       ];

//                       return Array.from({
//                         length: Math.min(DAYS_COUNT, DAY_COLORS.length),
//                       }).map((_, dayIdx) => {
//                         const color = DAY_COLORS[dayIdx];
//                         // Rotiramo mjesta po danu kroz kategorije
//                         const STOP_TYPES = [
//                           "cafe",
//                           "landmark",
//                           "park",
//                           "restaurant",
//                           "museum",
//                           "beach",
//                           "club",
//                         ];
//                         const dayStops: {
//                           venue: {
//                             name: string;
//                             latitude: number;
//                             longitude: number;
//                             address?: string;
//                           };
//                           type: string;
//                         }[] = [];

//                         for (let si = 0; si < STOP_TYPES.length; si++) {
//                           const type = STOP_TYPES[si];
//                           const list = allVenues[type];
//                           if (!list || list.length === 0) continue;
//                           const item = list[(dayIdx + si) % list.length];
//                           if (
//                             !dayStops.find((s) => s.venue.name === item.name)
//                           ) {
//                             dayStops.push({ venue: item, type });
//                             if (dayStops.length >= 4) break; // max 4 stopa po danu na karti
//                           }
//                         }

//                         return dayStops.map(({ venue, type }, stopIdx) => {
//                           const visited = isVenueVisited(venue, type);
//                           return (
//                             <Marker
//                               key={`day${dayIdx}_stop${stopIdx}_${venue.name}`}
//                               coordinate={{
//                                 latitude: venue.latitude,
//                                 longitude: venue.longitude,
//                               }}
//                               tracksViewChanges={false}
//                               onPress={() => {
//                                 mapRef.current?.animateToRegion(
//                                   {
//                                     latitude: venue.latitude,
//                                     longitude: venue.longitude,
//                                     latitudeDelta: 0.02,
//                                     longitudeDelta: 0.02,
//                                   },
//                                   500,
//                                 );
//                                 setSelectedPlaceForDetail({
//                                   id: `plan_${type}_${dayIdx}_${venue.name}`,
//                                   name: venue.name,
//                                   latitude: venue.latitude,
//                                   longitude: venue.longitude,
//                                   type: type as Place["type"],
//                                   address: venue.address,
//                                 });
//                                 setShowDetailModal(true);
//                               }}
//                             >
//                               <View
//                                 style={{
//                                   alignItems: "center",
//                                   width: 52,
//                                   height: 66,
//                                 }}
//                               >
//                                 {/* Krug s bojom dana i rednim brojem stopa */}
//                                 <View
//                                   style={{
//                                     width: 42,
//                                     height: 42,
//                                     borderRadius: 21,
//                                     backgroundColor: visited
//                                       ? "#34c75922"
//                                       : color + "dd",
//                                     borderWidth: 2.5,
//                                     borderColor: visited ? "#34c759" : "#fff",
//                                     justifyContent: "center",
//                                     alignItems: "center",
//                                     shadowColor: "#000",
//                                     shadowOffset: { width: 0, height: 2 },
//                                     shadowOpacity: 0.35,
//                                     shadowRadius: 4,
//                                     elevation: 6,
//                                   }}
//                                 >
//                                   {CATEGORY_ICONS[type] ? (
//                                     <Image
//                                       source={CATEGORY_ICONS[type]}
//                                       style={{ width: 26, height: 26 }}
//                                       resizeMode="contain"
//                                     />
//                                   ) : (
//                                     <Text style={{ fontSize: T.title }}>
//                                       {EMOJIS[type] || "📍"}
//                                     </Text>
//                                   )}
//                                 </View>
//                                 {/* Dan badge */}
//                                 <View
//                                   style={{
//                                     position: "absolute",
//                                     top: -4,
//                                     right: -2,
//                                     width: 18,
//                                     height: 18,
//                                     borderRadius: 9,
//                                     backgroundColor: color,
//                                     justifyContent: "center",
//                                     alignItems: "center",
//                                     borderWidth: 1.5,
//                                     borderColor: "#fff",
//                                   }}
//                                 >
//                                   <Text
//                                     style={{
//                                       color: "#fff",
//                                       fontSize: 9,
//                                       fontWeight: "900",
//                                     }}
//                                   >
//                                     D{dayIdx + 1}
//                                   </Text>
//                                 </View>
//                                 {/* Redni broj stopa */}
//                                 <View
//                                   style={{
//                                     position: "absolute",
//                                     bottom: 14,
//                                     left: -2,
//                                     width: 16,
//                                     height: 16,
//                                     borderRadius: 8,
//                                     backgroundColor: "#fff",
//                                     justifyContent: "center",
//                                     alignItems: "center",
//                                     borderWidth: 1,
//                                     borderColor: color,
//                                   }}
//                                 >
//                                   <Text
//                                     style={{
//                                       color: color,
//                                       fontSize: 8,
//                                       fontWeight: "900",
//                                     }}
//                                   >
//                                     {stopIdx + 1}
//                                   </Text>
//                                 </View>
//                                 {/* Pin */}
//                                 <View
//                                   style={{
//                                     width: 4,
//                                     height: 10,
//                                     backgroundColor: visited
//                                       ? "#34c759"
//                                       : color,
//                                     borderBottomLeftRadius: 4,
//                                     borderBottomRightRadius: 4,
//                                     marginTop: -2,
//                                   }}
//                                 />
//                               </View>
//                             </Marker>
//                           );
//                         });
//                       });
//                     })()}
//                   </MapView>

//                   {/* Info traka ispod karte: prikazano X od Y + dodaj još */}
//                   <View
//                     style={{
//                       backgroundColor: DC.card,
//                       borderBottomLeftRadius: 12,
//                       borderBottomRightRadius: 12,
//                       paddingHorizontal: 14,
//                       paddingVertical: 10,
//                       marginBottom: 8,
//                       flexDirection: "row",
//                       alignItems: "center",
//                       justifyContent: "space-between",
//                       borderWidth: 1,
//                       borderTopWidth: 0,
//                       borderColor: DC.borderDim,
//                     }}
//                   >
//                     <Text style={{ fontSize: T.meta, color: DC.accent, flex: 1 }}>
//                       📍 Prikazano{" "}
//                       {Math.min(mapMarkerLimit, allMapVenues.length)} od{" "}
//                       {allMapVenues.length} mjesta
//                     </Text>
//                     {hasMoreMarkers ? (
//                       <View style={{ flexDirection: "row", gap: 6 }}>
//                         <TouchableOpacity
//                           style={{
//                             backgroundColor: DC.cardHover,
//                             borderRadius: 8,
//                             paddingHorizontal: 10,
//                             paddingVertical: 5,
//                             borderWidth: 1,
//                             borderColor: DC.border,
//                           }}
//                           onPress={() => {
//                             const newLimit = mapMarkerLimit + 5;
//                             setMapMarkerLimit(newLimit);
//                             const newVisible = allMapVenues.slice(0, newLimit);
//                             if (mapRef.current && newVisible.length > 0) {
//                               mapRef.current.fitToCoordinates(
//                                 [
//                                   ...newVisible.map(({ venue }) => ({
//                                     latitude: venue.latitude,
//                                     longitude: venue.longitude,
//                                   })),
//                                   ...(accommodationCoords
//                                     ? [accommodationCoords]
//                                     : []),
//                                 ],
//                                 {
//                                   edgePadding: {
//                                     top: 60,
//                                     right: 40,
//                                     bottom: 60,
//                                     left: 40,
//                                   },
//                                   animated: true,
//                                 },
//                               );
//                             }
//                           }}
//                         >
//                           <Text
//                             style={{
//                               color: DC.text,
//                               fontSize: T.caption,
//                               fontWeight: "700",
//                             }}
//                           >
//                             +5
//                           </Text>
//                         </TouchableOpacity>
//                         <TouchableOpacity
//                           style={{
//                             backgroundColor: DC.cardHover,
//                             borderRadius: 8,
//                             paddingHorizontal: 10,
//                             paddingVertical: 5,
//                             borderWidth: 1,
//                             borderColor: DC.border,
//                           }}
//                           onPress={() => {
//                             const newLimit = mapMarkerLimit + 10;
//                             setMapMarkerLimit(newLimit);
//                             const newVisible = allMapVenues.slice(0, newLimit);
//                             if (mapRef.current && newVisible.length > 0) {
//                               mapRef.current.fitToCoordinates(
//                                 [
//                                   ...newVisible.map(({ venue }) => ({
//                                     latitude: venue.latitude,
//                                     longitude: venue.longitude,
//                                   })),
//                                   ...(accommodationCoords
//                                     ? [accommodationCoords]
//                                     : []),
//                                 ],
//                                 {
//                                   edgePadding: {
//                                     top: 60,
//                                     right: 40,
//                                     bottom: 60,
//                                     left: 40,
//                                   },
//                                   animated: true,
//                                 },
//                               );
//                             }
//                           }}
//                         >
//                           <Text
//                             style={{
//                               color: DC.text,
//                               fontSize: T.caption,
//                               fontWeight: "700",
//                             }}
//                           >
//                             +10
//                           </Text>
//                         </TouchableOpacity>
//                         {allMapVenues.length - mapMarkerLimit > 10 && (
//                           <TouchableOpacity
//                             style={{
//                               backgroundColor: DC.bg,
//                               borderRadius: 8,
//                               paddingHorizontal: 10,
//                               paddingVertical: 5,
//                               borderWidth: 1,
//                               borderColor: DC.borderDim,
//                             }}
//                             onPress={() => {
//                               setMapMarkerLimit(allMapVenues.length);
//                               if (mapRef.current && allMapVenues.length > 0) {
//                                 mapRef.current.fitToCoordinates(
//                                   allMapVenues.map(({ venue }) => ({
//                                     latitude: venue.latitude,
//                                     longitude: venue.longitude,
//                                   })),
//                                   {
//                                     edgePadding: {
//                                       top: 60,
//                                       right: 40,
//                                       bottom: 60,
//                                       left: 40,
//                                     },
//                                     animated: true,
//                                   },
//                                 );
//                               }
//                             }}
//                           >
//                             <Text
//                               style={{
//                                 color: DC.accent,
//                                 fontSize: T.caption,
//                                 fontWeight: "700",
//                               }}
//                             >
//                               Svi ({allMapVenues.length})
//                             </Text>
//                           </TouchableOpacity>
//                         )}
//                       </View>
//                     ) : (
//                       <Text
//                         style={{
//                           fontSize: T.caption,
//                           color: DC.accent,
//                           fontWeight: "600",
//                         }}
//                       >
//                         ✓ Sve prikazano
//                       </Text>
//                     )}
//                   </View>
//                 </>
//               );
//             })()}

//             {/* Legenda kategorija */}
//             {/* Legenda dana */}
//             <View style={mapLegend.legendContainer}>
//               <Text style={mapLegend.legendTitle}>RUTE PO DANIMA</Text>
//               <ScrollView horizontal showsHorizontalScrollIndicator={false}>
//                 <View style={mapLegend.legendRow}>
//                   {userLocation && (
//                     <View
//                       style={[
//                         mapLegend.chip,
//                         {
//                           backgroundColor: "#34c75922",
//                           borderColor: "#34c759",
//                         },
//                       ]}
//                     >
//                       <View
//                         style={[mapLegend.dot, { backgroundColor: "#34c759" }]}
//                       />
//                       <Text style={mapLegend.chipText}>📍 Vaša lokacija</Text>
//                     </View>
//                   )}
//                   {accommodationCoords && (
//                     <View
//                       style={[
//                         mapLegend.chip,
//                         {
//                           backgroundColor: "#667eea22",
//                           borderColor: "#667eea",
//                         },
//                       ]}
//                     >
//                       <View
//                         style={[mapLegend.dot, { backgroundColor: "#667eea" }]}
//                       />
//                       <Text style={mapLegend.chipText}>🏨 Smještaj</Text>
//                     </View>
//                   )}
//                   {(() => {
//                     const DAY_COLORS = [
//                       "#e74c3c",
//                       "#2ecc71",
//                       "#3498db",
//                       "#f39c12",
//                       "#9b59b6",
//                       "#1abc9c",
//                       "#e67e22",
//                     ];
//                     const DAYS_COUNT = Math.min(
//                       {
//                         dan: 1,
//                         vikend: 2,
//                         tjedan: 7,
//                         "2tjedna": 14,
//                         godisnji: 10,
//                       }[period] || 1,
//                       7,
//                     );
//                     return Array.from({
//                       length: Math.min(DAYS_COUNT, DAY_COLORS.length),
//                     }).map((_, i) => (
//                       <View
//                         key={i}
//                         style={[
//                           mapLegend.chip,
//                           {
//                             backgroundColor: DAY_COLORS[i] + "33",
//                             borderColor: DAY_COLORS[i],
//                           },
//                         ]}
//                       >
//                         <View
//                           style={[
//                             mapLegend.dot,
//                             { backgroundColor: DAY_COLORS[i] },
//                           ]}
//                         />
//                         <Text
//                           style={[
//                             mapLegend.chipText,
//                             { color: DAY_COLORS[i], fontWeight: "700" },
//                           ]}
//                         >
//                           Dan {i + 1}
//                         </Text>
//                       </View>
//                     ));
//                   })()}
//                 </View>
//               </ScrollView>
//               <Text style={{ fontSize: T.caption, color: DC.accent, marginTop: 6 }}>
//                 💡 Tapnite marker → slike, radno vrijeme, ocjena, označi posjet
//                 · D1 = Dan 1, D2 = Dan 2...
//               </Text>
//             </View>

//             {/* PO KATEGORIJAMA: min 5 opcija, korisnik bira */}
//             <View style={{ marginTop: 8, marginBottom: 8 }}>
//               <Text style={planStyles.sectionHeader}>
//                 🗂️ Odaberite svoja mjesta po kategorijama
//               </Text>
//               <Text style={planStyles.sectionSub}>
//                 Tapnite karticu za detalje · Tapnite "Označi posjet" kada
//                 posjetite
//               </Text>
//             </View>

//             {Object.entries(allVenues).map(([type, options]) => {
//               const cat = placeCategories[type as keyof typeof placeCategories];
//               const color = cat?.color || "#667eea";
//               const visitedInCat = options.filter((v) =>
//                 isVenueVisited(v, type),
//               ).length;
//               // Prikaži sve opcije, minimum 5 ako ih ima
//               const displayOptions = options;

//               return (
//                 <View
//                   key={type}
//                   style={[
//                     planStyles.categorySection,
//                     { borderTopColor: color },
//                   ]}
//                 >
//                   {/* Naslov kategorije */}
//                   <View style={planStyles.categoryHeader}>
//                     <View
//                       style={[
//                         planStyles.categoryDot,
//                         {
//                           backgroundColor: color + "22",
//                           borderWidth: 1,
//                           borderColor: color,
//                         },
//                       ]}
//                     >
//                       {CATEGORY_ICONS[type] ? (
//                         <Image
//                           source={CATEGORY_ICONS[type]}
//                           style={{ width: 56, height: 56 }} // ← povećano
//                           resizeMode="contain"
//                         />
//                       ) : (
//                         <Text style={{ fontSize: 28 }}>
//                           {EMOJIS[type] || "📍"}
//                         </Text>
//                       )}
//                     </View>
//                     <View style={{ flex: 1 }}>
//                       <Text style={planStyles.categoryTitle}>
//                         {t(`categories.${type}`, { defaultValue: type })}
//                       </Text>
//                       <Text style={planStyles.categorySub}>
//                         {displayOptions.length} prijedloga
//                         {visitedInCat > 0
//                           ? ` · ✓ ${visitedInCat} posjećeno`
//                           : ""}
//                         {displayOptions.length < 5 ? " (OSM podaci)" : ""}
//                       </Text>
//                     </View>
//                     {visitedInCat > 0 && (
//                       <View
//                         style={[
//                           planStyles.categoryDot,
//                           {
//                             backgroundColor: color + "22",
//                             borderWidth: 1,
//                             borderColor: color,
//                             width: 64, // ← povećano
//                             height: 64, // ← povećano
//                             borderRadius: 32, // ← povećano
//                           },
//                         ]}
//                       >
//                         <Text style={[planStyles.catBadgeText, { color }]}>
//                           {visitedInCat}/{displayOptions.length}
//                         </Text>
//                       </View>
//                     )}
//                   </View>

//                   {/* Info ako nema dovoljno opcija */}
//                   {displayOptions.length < 5 && (
//                     <View
//                       style={{
//                         backgroundColor: DC.card,
//                         marginHorizontal: 12,
//                         marginBottom: 8,
//                         borderRadius: 8,
//                         padding: 10,
//                         borderWidth: 1,
//                         borderColor: DC.borderDim,
//                       }}
//                     >
//                       <Text style={{ fontSize: T.meta, color: DC.accent }}>
//                         ℹ️ Pronađeno {displayOptions.length} mjesta u radijusu{" "}
//                         {activityRadius} km. Povećajte radijus za više opcija.
//                       </Text>
//                     </View>
//                   )}

//                   {/* Venue kartice */}
//                   {displayOptions.map((venue, idx) => {
//                     const visited = isVenueVisited(venue, type);
//                     const dist = accommodationCoords
//                       ? haversineKm(
//                           accommodationCoords.latitude,
//                           accommodationCoords.longitude,
//                           venue.latitude,
//                           venue.longitude,
//                         )
//                       : null;
//                     const placeObj = venueToPlace(venue, type);

//                     return (
//                       <View
//                         key={idx}
//                         style={[
//                           planStyles.venueCard,
//                           visited && planStyles.venueCardVisited,
//                         ]}
//                       >
//                         {/* Broj opcije */}
//                         <View
//                           style={{
//                             width: 28,
//                             height: 28,
//                             borderRadius: 14,
//                             backgroundColor: visited
//                               ? "#34c75922"
//                               : color + "22",
//                             justifyContent: "center",
//                             alignItems: "center",
//                             borderWidth: 1,
//                             borderColor: visited ? "#34c759" : color,
//                             marginRight: 2,
//                           }}
//                         >
//                           <Text
//                             style={{
//                               fontSize: T.caption,
//                               fontWeight: "800",
//                               color: visited ? "#34c759" : color,
//                             }}
//                           >
//                             {idx + 1}
//                           </Text>
//                         </View>

//                         {/* Info */}
//                         <TouchableOpacity
//                           style={{ flex: 1 }}
//                           onPress={() => {
//                             setSelectedPlaceForDetail(placeObj);
//                             setShowDetailModal(true);
//                           }}
//                           activeOpacity={0.75}
//                         >
//                           <View
//                             style={{
//                               flexDirection: "row",
//                               alignItems: "flex-start",
//                               gap: 6,
//                             }}
//                           >
//                             {CATEGORY_ICONS[type] ? (
//                               <Image
//                                 source={CATEGORY_ICONS[type]}
//                                 style={{ width: 40, height: 40 }} // ← povećano
//                                 resizeMode="contain"
//                               />
//                             ) : (
//                               <Text style={{ fontSize: 28 }}>
//                                 {EMOJIS[type] || "📍"}
//                               </Text>
//                             )}
//                             <View style={{ flex: 1 }}>
//                               <Text
//                                 style={[
//                                   planStyles.venueName,
//                                   visited && { color: "#34c759" },
//                                 ]}
//                                 numberOfLines={1}
//                               >
//                                 {visited && "✓ "}
//                                 {venue.name}
//                               </Text>
//                               {venue.address ? (
//                                 <Text
//                                   style={planStyles.venueAddress}
//                                   numberOfLines={1}
//                                 >
//                                   📍 {venue.address}
//                                 </Text>
//                               ) : null}
//                               <View
//                                 style={{
//                                   flexDirection: "row",
//                                   gap: 8,
//                                   marginTop: 3,
//                                 }}
//                               >
//                                 {dist !== null && (
//                                   <Text
//                                     style={[
//                                       planStyles.venueDist,
//                                       { color: dist < 1 ? "#34c759" : color },
//                                     ]}
//                                   >
//                                     {dist < 1
//                                       ? `${Math.round(dist * 1000)} m`
//                                       : `${dist.toFixed(1)} km`}
//                                   </Text>
//                                 )}
//                                 <Text style={planStyles.venueDetailHint}>
//                                   Tapni za slike i detalje
//                                 </Text>
//                               </View>
//                             </View>
//                           </View>
//                         </TouchableOpacity>

//                         {/* Označi posjet gumb */}
//                         <TouchableOpacity
//                           style={[
//                             planStyles.visitToggleBtn,
//                             visited
//                               ? planStyles.visitToggleBtnVisited
//                               : { borderColor: color },
//                             { minWidth: 52, maxWidth: 52 }, // ← fiksiraj širinu
//                           ]}
//                           onPress={() => handleMarkVisitedFromPlan(venue, type)}
//                           disabled={visited}
//                         >
//                           {visited ? (
//                             <Text
//                               style={[
//                                 planStyles.visitToggleTextVisited,
//                                 { fontSize: 9 },
//                               ]}
//                             >
//                               ✓{"\n"}Bilo
//                             </Text>
//                           ) : (
//                             <Text
//                               style={[
//                                 planStyles.visitToggleText,
//                                 { color, fontSize: 9 },
//                               ]}
//                             >
//                               Označi{"\n"}posjet
//                             </Text>
//                           )}
//                         </TouchableOpacity>
//                       </View>
//                     );
//                   })}
//                 </View>
//               );
//             })}

//             {/* Generirani plan */}
//             <View style={{ marginTop: 20 }}>
//               <Text style={planStyles.sectionHeader}>
//                 📋 Generirani plan putovanja
//               </Text>
//               <Text style={planStyles.sectionSub}>
//                 Konkretna mjesta iz gornjih kategorija integrirana u dnevni
//                 raspored
//               </Text>
//             </View>
//             <PlanRenderer text={result} />

//             <View style={{ gap: 10, marginTop: 20 }}>
//               <TouchableOpacity style={pm.btnPrimary} onPress={copyPlan}>
//                 <Text style={pm.btnPrimaryText}>📋 Kopiraj cijeli plan</Text>
//               </TouchableOpacity>
//               <TouchableOpacity
//                 style={pm.btnSecondary}
//                 onPress={() => setStep("form")}
//               >
//                 <Text style={pm.btnSecondaryText}> Generiraj novi plan</Text>
//               </TouchableOpacity>
//             </View>
//           </ScrollView>
//         )}

//         {/* ── FORM ─────────────────────────────────────────────────── */}
//         {step === "form" && (
//           <KeyboardAvoidingView
//             style={{ flex: 1 }}
//             behavior={Platform.OS === "ios" ? "padding" : "height"}
//           >
//             <ScrollView
//               contentContainerStyle={{ paddingBottom: 40 }}
//               keyboardShouldPersistTaps="handled"
//               style={{ backgroundColor: DC.bg }}
//             >
//               {/* ── DESTINACIJA ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   {t("map.destination")}
//                 </Text>
//                 <TextInput
//                   style={{
//                     backgroundColor: DC.card,
//                     borderRadius: 10,
//                     borderWidth: 1,
//                     borderColor: DC.border,
//                     paddingHorizontal: 14,
//                     paddingVertical: 10,
//                     fontSize: T.body,
//                     color: DC.text,
//                     marginBottom: 8,
//                   }}
//                   placeholder={t("plan.destinationPlaceholder")}
//                   placeholderTextColor={DC.textDim}
//                   value={destination}
//                   onChangeText={setDestination}
//                 />
//                 <TextInput
//                   style={{
//                     backgroundColor: DC.card,
//                     borderRadius: 10,
//                     borderWidth: 1,
//                     borderColor: DC.border,
//                     paddingHorizontal: 14,
//                     paddingVertical: 10,
//                     fontSize: T.body,
//                     color: DC.text,
//                   }}
//                   placeholder={t("plan.postalCode")}
//                   placeholderTextColor={DC.textDim}
//                   value={postalCode}
//                   onChangeText={setPostalCode}
//                   keyboardType="numeric"
//                 />
//                 <TextInput
//                   style={{
//                     marginTop: 8,
//                     backgroundColor: DC.card,
//                     borderRadius: 10,
//                     borderWidth: 1,
//                     borderColor: DC.border,
//                     paddingHorizontal: 14,
//                     paddingVertical: 10,
//                     fontSize: T.body,
//                     color: DC.text,
//                   }}
//                   placeholder={t("plan.accommodation")}
//                   placeholderTextColor={DC.textDim}
//                   value={accommodationAddress}
//                   onChangeText={setAccommodationAddress}
//                 />
//               </View>

//               {/* ── TRAJANJE ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   {t("map.duration")}
//                 </Text>
//                 <View
//                   style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
//                 >
//                   {PERIOD_OPTIONS.map((o) => {
//                     const active = period === o.key;
//                     return (
//                       <TouchableOpacity
//                         key={o.key}
//                         style={{
//                           paddingHorizontal: 16,
//                           paddingVertical: 9,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 8,
//                           borderWidth: 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                         }}
//                         onPress={() => setPeriod(o.key)}
//                       >
//                         <Text
//                           style={{
//                             fontSize: T.meta,
//                             color: active ? DC.text : DC.textDim,
//                             fontWeight: active ? "700" : "400",
//                           }}
//                         >
//                           {t(o.labelKey)}
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── PUTNICI ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   {t("map.travelers")}
//                 </Text>
//                 <Text
//                   style={{ fontSize: T.meta, color: DC.textDim, marginBottom: 8 }}
//                 >
//                   {t("plan.numberOfPeople")}
//                 </Text>
//                 <View
//                   style={{
//                     flexDirection: "row",
//                     flexWrap: "wrap",
//                     gap: 8,
//                     marginBottom: 14,
//                   }}
//                 >
//                   {["1", "2", "3", "4", "5+"].map((n) => {
//                     const val = n === "5+" ? "6" : n;
//                     const active = people === val;
//                     return (
//                       <TouchableOpacity
//                         key={n}
//                         style={{
//                           paddingHorizontal: 16,
//                           paddingVertical: 9,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 8,
//                           borderWidth: 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                         }}
//                         onPress={() => setPeople(val)}
//                       >
//                         <Text
//                           style={{
//                             fontSize: T.meta,
//                             color: active ? DC.text : DC.textDim,
//                             fontWeight: active ? "700" : "400",
//                           }}
//                         >
//                           {n}
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//                 <Text
//                   style={{ fontSize: T.meta, color: DC.textDim, marginBottom: 8 }}
//                 >
//                   {t("plan.travelWith")}
//                 </Text>
//                 <View
//                   style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
//                 >
//                   {COMPANION_OPTIONS.map((o) => {
//                     const active = companions === o.key;
//                     return (
//                       <TouchableOpacity
//                         key={o.key}
//                         style={{
//                           paddingHorizontal: 10,
//                           paddingVertical: 10,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 12,
//                           borderWidth: active ? 2 : 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                           alignItems: "center",
//                           width: CELL_W,
//                           height: 130,
//                           justifyContent: "center",
//                         }}
//                         onPress={() => setCompanions(o.key)}
//                       >
//                         <Image
//                           source={o.image}
//                           style={{ width: 96, height: 96, marginBottom: 4 }}
//                           resizeMode="contain"
//                         />
//                         <Text
//                           style={{
//                             fontSize: T.caption,
//                             fontWeight: "600",
//                             color: active ? "#fff" : DC.textSub,
//                             textAlign: "center",
//                           }}
//                           numberOfLines={2}
//                         >
//                           {t(o.labelKey)}
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── BUDŽET ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   {t("map.budgetTitle")}
//                 </Text>
//                 <View
//                   style={{
//                     flexDirection: "row",
//                     flexWrap: "wrap",
//                     gap: 8,
//                   }}
//                 >
//                   {["200", "500", "1000", "2000", "5000"].map((b) => {
//                     const active = budget === b;
//                     return (
//                       <TouchableOpacity
//                         key={b}
//                         style={{
//                           paddingHorizontal: 16,
//                           paddingVertical: 9,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 8,
//                           borderWidth: 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                         }}
//                         onPress={() => setBudget(b)}
//                       >
//                         <Text
//                           style={{
//                             fontSize: T.meta,
//                             color: active ? DC.text : DC.textDim,
//                             fontWeight: active ? "700" : "400",
//                           }}
//                         >
//                           {b} €
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── RADIJUS AKTIVNOSTI ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   {t("map.activityRadius")}
//                 </Text>
//                 <View
//                   style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
//                 >
//                   {[1, 2, 3, 5, 10, 20].map((r) => {
//                     const active = activityRadius === r;
//                     return (
//                       <TouchableOpacity
//                         key={r}
//                         style={{
//                           paddingHorizontal: 16,
//                           paddingVertical: 9,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 8,
//                           borderWidth: 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                         }}
//                         onPress={() => setActivityRadius(r)}
//                       >
//                         <Text
//                           style={{
//                             fontSize: T.meta,
//                             color: active ? DC.text : DC.textDim,
//                             fontWeight: active ? "700" : "400",
//                           }}
//                         >
//                           {r} km
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── PRIJEVOZ ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   Prijevoz
//                 </Text>
//                 <View
//                   style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
//                 >
//                   {TRANSPORT_OPTIONS.map((o) => {
//                     const active = transport === o.key;
//                     return (
//                       <TouchableOpacity
//                         key={o.key}
//                         style={{
//                           paddingHorizontal: 10,
//                           paddingVertical: 10,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 12,
//                           borderWidth: active ? 2 : 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                           alignItems: "center",
//                           width: CELL_W,
//                           height: 130,
//                           justifyContent: "center",
//                         }}
//                         onPress={() => setTransport(o.key)}
//                       >
//                         <Image
//                           source={o.image}
//                           style={{ width: 96, height: 96, marginBottom: 4 }}
//                           resizeMode="contain"
//                         />
//                         <Text
//                           style={{
//                             fontSize: T.caption,
//                             fontWeight: "600",
//                             color: active ? "#fff" : DC.textSub,
//                             textAlign: "center",
//                           }}
//                           numberOfLines={2}
//                         >
//                           {t(o.labelKey)}
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── AKTIVNOSTI PREFERENCE ── */}
//               <View
//                 style={{
//                   padding: 16,
//                   borderBottomWidth: 1,
//                   borderBottomColor: DC.borderDim,
//                 }}
//               >
//                 <Text
//                   style={{
//                     fontSize: T.body,
//                     fontWeight: "700",
//                     color: DC.textSub,
//                     marginBottom: 10,
//                   }}
//                 >
//                   {t("map.activities")}
//                 </Text>
//                 <View
//                   style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
//                 >
//                   {PREF_OPTIONS.map((o) => {
//                     const active = preference === o.key;
//                     return (
//                       <TouchableOpacity
//                         key={o.key}
//                         style={{
//                           paddingHorizontal: 10,
//                           paddingVertical: 10,
//                           backgroundColor: active ? DC.cardHover : DC.card,
//                           borderRadius: 12,
//                           borderWidth: active ? 2 : 1,
//                           borderColor: active ? DC.border : DC.borderDim,
//                           alignItems: "center",
//                           width: CELL_W,
//                           height: 130,
//                           justifyContent: "center",
//                         }}
//                         onPress={() => setPreference(o.key)}
//                       >
//                         <Image
//                           source={o.image}
//                           style={{ width: 96, height: 96, marginBottom: 4 }}
//                           resizeMode="contain"
//                         />
//                         <Text
//                           style={{
//                             fontSize: T.caption,
//                             fontWeight: "600",
//                             color: active ? "#fff" : DC.textSub,
//                             textAlign: "center",
//                           }}
//                           numberOfLines={2}
//                         >
//                           {t(o.labelKey)}
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── INTERESI — IDENTIČNO KATEGORIJAMA U FILTRU ── */}
//               <View
//                 style={{
//                   paddingHorizontal: 16,
//                   paddingTop: 12,
//                   paddingBottom: 4,
//                 }}
//               >
//                 <View
//                   style={{
//                     flexDirection: "row",
//                     justifyContent: "space-between",
//                     alignItems: "center",
//                     marginBottom: 8,
//                   }}
//                 >
//                   <Text
//                     style={{
//                       fontSize: T.body,
//                       fontWeight: "700",
//                       color: DC.textSub,
//                     }}
//                   >
//                     {t("map.interestsOptional")}
//                   </Text>
//                   {interests.length > 0 && (
//                     <TouchableOpacity onPress={() => setInterests([])}>
//                       <Text
//                         style={{
//                           fontSize: T.meta,
//                           color: DC.accent,
//                           fontWeight: "600",
//                         }}
//                       >
//                         {t("plan.clearInterests")}
//                       </Text>
//                     </TouchableOpacity>
//                   )}
//                 </View>
//                 <View
//                   style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
//                 >
//                   {getAllCategories().map((cat) => {
//                     const active = interests.includes(cat.id);
//                     return (
//                       <TouchableOpacity
//                         key={cat.id}
//                         style={{
//                           width: CELL_W,
//                           height: 130,
//                           backgroundColor: active ? cat.color : DC.card,
//                           borderRadius: 12,
//                           justifyContent: "center",
//                           alignItems: "center",
//                           paddingHorizontal: 4,
//                           paddingVertical: 8,
//                           borderWidth: active ? 2 : 1,
//                           borderColor: active ? cat.color : DC.borderDim,
//                         }}
//                         onPress={() => toggleInterest(cat.id)}
//                       >
//                         {CATEGORY_ICONS[cat.id] ? (
//                           <Image
//                             source={CATEGORY_ICONS[cat.id]}
//                             style={{ width: 96, height: 96, marginBottom: 4 }}
//                             resizeMode="contain"
//                           />
//                         ) : (
//                           <Text style={{ fontSize: 56, marginBottom: 4 }}>
//                             {cat.icon}
//                           </Text>
//                         )}
//                         <Text
//                           style={{
//                             fontSize: T.caption,
//                             fontWeight: "600",
//                             color: active ? "#fff" : DC.textSub,
//                             textAlign: "center",
//                           }}
//                           numberOfLines={2}
//                         >
//                           {cat.name}
//                         </Text>
//                       </TouchableOpacity>
//                     );
//                   })}
//                 </View>
//               </View>

//               {/* ── GENERIRAJ GUMB ── */}
//               <TouchableOpacity
//                 style={{
//                   margin: 16,
//                   backgroundColor: DC.cardHover,
//                   borderRadius: 12,
//                   borderWidth: 1.5,
//                   borderColor: DC.border,
//                   paddingVertical: 16,
//                   alignItems: "center",
//                 }}
//                 onPress={generate}
//               >
//                 <Text
//                   style={{ color: DC.text, fontSize: T.lead, fontWeight: "700" }}
//                 >
//                   {t("map.generatePlan")}
//                 </Text>
//               </TouchableOpacity>
//               <Text
//                 style={{
//                   textAlign: "center",
//                   fontSize: T.meta,
//                   color: DC.textDim,
//                   marginBottom: 24,
//                   paddingHorizontal: 20,
//                 }}
//               >
//                 {t("plan.generateHint", {
//                   destination: destination || t("plan.destination"),
//                 })}
//               </Text>
//             </ScrollView>
//           </KeyboardAvoidingView>
//         )}

//         {/* ══════════════════════════════════════════════════════════════
//             PlaceDetailModal — MORA BITI IZVAN ScrollViewa, na root razini!
//             Otvara se i kad kliknete marker na karti i kad kliknete karticu.
//             Ima iste mogućnosti kao na glavnoj karti:
//               • Google slike
//               • Radno vrijeme
//               • Ocjena (zvjezdice + komentar)
//               • Označi posjet → arhiva + značka
//         ════════════════════════════════════════════════════════════════ */}
//         <PlaceDetailModal
//           place={selectedPlaceForDetail}
//           visible={showDetailModal}
//           onClose={() => {
//             setShowDetailModal(false);
//             setSelectedPlaceForDetail(null);
//           }}
//           onMarkVisited={async (p) => {
//             if (onMarkVisited) await onMarkVisited(p);
//             setLocalVisitedIds((prev) => new Set([...prev, p.id]));
//             setShowDetailModal(false);
//             setSelectedPlaceForDetail(null);
//           }}
//           onHidePlace={() => {
//             setShowDetailModal(false);
//             setSelectedPlaceForDetail(null);
//           }}
//           isVisited={
//             selectedPlaceForDetail
//               ? localVisitedIds.has(selectedPlaceForDetail.id) ||
//                 visits.some(
//                   (v) =>
//                     v.placeName.toLowerCase() ===
//                       (selectedPlaceForDetail.name || "").toLowerCase() &&
//                     v.placeType === selectedPlaceForDetail.type,
//                 )
//               : false
//           }
//           notifPrefs={{
//             appEnabled: false,
//             emailEnabled: false,
//             email: "",
//             categories: [],
//           }}
//           onToggleNotif={() => {}}
//         />
//       </View>
//     </Modal>
//   );
// }

// const mapLegend = StyleSheet.create({
//   header: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "flex-start",
//     marginBottom: 10,
//     paddingHorizontal: 2,
//   },
//   headerTitle: { fontSize: T.lead, fontWeight: "800", color: "#1a1a1a" },
//   headerSub: { fontSize: T.meta, color: "#888", marginTop: 2, maxWidth: "90%" },
//   recenterBtn: {
//     width: 38,
//     height: 38,
//     borderRadius: 19,
//     backgroundColor: "#f0f0ff",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   legendContainer: {
//     backgroundColor: "#fff",
//     borderRadius: 12,
//     padding: 12,
//     marginBottom: 8,
//     borderWidth: 1,
//     borderColor: "#f0f0f0",
//   },
//   legendTitle: {
//     fontSize: T.meta,
//     fontWeight: "700",
//     color: "#888",
//     marginBottom: 8,
//     textTransform: "uppercase",
//     letterSpacing: 0.8,
//   },
//   legendRow: { flexDirection: "row", gap: 8, paddingBottom: 2 },
//   chip: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 5,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 20,
//     borderWidth: 1.5,
//   },
//   dot: { width: 8, height: 8, borderRadius: 4 },
//   chipText: { fontSize: T.caption, fontWeight: "600", color: "#333" },
//   distanceSection: {
//     backgroundColor: "#f8f9ff",
//     borderRadius: 14,
//     padding: 14,
//     marginBottom: 16,
//   },
//   distanceTitle: {
//     fontSize: T.meta,
//     fontWeight: "700",
//     color: "#333",
//     marginBottom: 10,
//   },
//   distanceGrid: { gap: 8 },
//   distanceChip: {
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: "#fff",
//     borderRadius: 10,
//     padding: 10,
//     borderLeftWidth: 4,
//     gap: 10,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.05,
//     shadowRadius: 3,
//     elevation: 1,
//   },
//   distanceEmoji: { fontSize: T.screen },
//   distanceName: { fontSize: T.meta, fontWeight: "600", color: "#333" },
//   distanceKm: { fontSize: T.meta, fontWeight: "700", marginTop: 2 },
// });

// const planStyles = StyleSheet.create({
//   // Progress card
//   progressCard: {
//     backgroundColor: "#f0f0ff",
//     borderRadius: 16,
//     padding: 16,
//     marginBottom: 16,
//     borderWidth: 1,
//     borderColor: "#e0e4ff",
//   },
//   progressHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     marginBottom: 10,
//   },
//   progressTitle: { fontSize: T.body, fontWeight: "700", color: "#333" },
//   progressCount: { fontSize: T.body, fontWeight: "800", color: "#667eea" },
//   progressTrack: {
//     height: 8,
//     backgroundColor: "rgba(102,126,234,0.15)",
//     borderRadius: 4,
//     overflow: "hidden",
//   },
//   progressFill: {
//     height: "100%",
//     backgroundColor: "#667eea",
//     borderRadius: 4,
//   },
//   progressHint: {
//     fontSize: T.meta,
//     color: "#667eea",
//     marginTop: 8,
//     fontWeight: "600",
//   },

//   // Section headers
//   sectionHeader: {
//     fontSize: T.lead,
//     fontWeight: "800",
//     color: "#1a1a1a",
//     marginBottom: 4,
//   },
//   sectionSub: { fontSize: T.meta, color: "#999", marginBottom: 12 },

//   // Category section
//   categorySection: {
//     backgroundColor: "#fff",
//     borderRadius: 16,
//     marginBottom: 16,
//     borderTopWidth: 4,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.06,
//     shadowRadius: 6,
//     elevation: 2,
//     overflow: "hidden",
//   },
//   categoryHeader: {
//     flexDirection: "row",
//     alignItems: "center",
//     padding: 14,
//     gap: 10,
//     backgroundColor: "#fafafa",
//     borderBottomWidth: 1,
//     borderBottomColor: "#f0f0f0",
//   },
//   categoryDot: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   categoryTitle: { fontSize: T.body, fontWeight: "800", color: "#1a1a1a" },
//   categorySub: { fontSize: T.meta, color: "#888", marginTop: 2 },
//   catBadge: {
//     borderRadius: 12,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//     borderWidth: 1.5,
//   },
//   catBadgeText: { fontSize: T.meta, fontWeight: "800" },

//   // Venue card
//   venueCard: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingHorizontal: 14,
//     paddingVertical: 12,
//     borderBottomWidth: 1,
//     borderBottomColor: "#f5f5f5",
//     gap: 10,
//     backgroundColor: "#fff",
//   },
//   venueCardVisited: {
//     backgroundColor: "#f0fff4",
//   },
//   venueName: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: "#1a1a1a",
//   },
//   venueAddress: {
//     fontSize: T.caption,
//     color: "#999",
//     marginTop: 2,
//   },
//   venueDist: {
//     fontSize: T.caption,
//     fontWeight: "700",
//     marginTop: 2,
//   },
//   venueDetailHint: {
//     fontSize: T.caption,
//     color: "#bbb",
//     marginTop: 2,
//   },

//   // Mark visited button
//   visitToggleBtn: {
//     minWidth: 64,
//     paddingHorizontal: 10,
//     paddingVertical: 8,
//     borderRadius: 12,
//     borderWidth: 1.5,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   visitToggleBtnVisited: {
//     backgroundColor: "#e8f5e9",
//     borderColor: "#34c759",
//   },
//   visitToggleText: {
//     fontSize: T.caption,
//     fontWeight: "700",
//     textAlign: "center",
//     lineHeight: 14,
//   },
//   visitToggleTextVisited: {
//     fontSize: T.caption,
//     fontWeight: "800",
//     color: "#34c759",
//     textAlign: "center",
//   },
// });

// ─── Visit Archive Modal ──────────────────────────────────────────────────────
function VisitArchiveModal({
  visible,
  onClose,
  visits,
  onSelectVisit,
  onDeleteVisit,
  onDeleteVisits,
}: {
  visible: boolean;
  onClose: () => void;
  visits: VisitRecord[];
  onSelectVisit: (v: VisitRecord) => void;
  onDeleteVisit: (id: string) => void;
  /** Briše više posjeta odjednom (cijela kategorija). */
  onDeleteVisits: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDashColors(isDark);
  const [filter, setFilter] = useState<string | null>(null);
  const filtered = filter
    ? visits.filter((v) => v.placeType === filter)
    : visits;
  const usedTypes = [...new Set(visits.map((v) => v.placeType))];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: DC.bg }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 20,
            paddingTop: Platform.OS === "ios" ? 54 : 36,
            borderBottomWidth: 1.5,
            borderBottomColor: DC.border,
            backgroundColor: DC.bg,
          }}
        >
          <Text
            style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
          >
            {t("map.visitArchive")}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text
              style={{ fontSize: T.body, color: DC.textDim, fontWeight: "600" }}
            >
              {t("common.close")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter chips */}
        {usedTypes.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              maxHeight: 56,
              borderBottomWidth: 1,
              borderBottomColor: DC.borderDim,
              backgroundColor: DC.bg,
            }}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 8,
            }}
          >
            <TouchableOpacity
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                backgroundColor: !filter ? DC.cardHover : DC.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: !filter ? DC.border : DC.borderDim,
              }}
              onPress={() => setFilter(null)}
            >
              <Text
                style={{
                  fontSize: T.meta,
                  fontWeight: "600",
                  color: !filter ? DC.text : DC.textDim,
                }}
              >
                {t("common.all")}
              </Text>
            </TouchableOpacity>
            {usedTypes.map((type) => {
              const cat = placeCategories[type as keyof typeof placeCategories];
              const active = filter === type;
              const inType = visits.filter((v) => v.placeType === type);
              const typeName = t(`categories.${type}`, { defaultValue: type });
              return (
                <View
                  key={type}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      backgroundColor: active
                        ? cat?.color || "#3a5a30"
                        : "#2a4230",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: active
                        ? cat?.color || DC.border
                        : DC.borderDim,
                    }}
                    onPress={() => setFilter(active ? null : type)}
                  >
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "600",
                        color: active ? "#fff" : DC.textDim,
                      }}
                    >
                      {EMOJIS[type]} {typeName} ({inType.length})
                    </Text>
                  </TouchableOpacity>
                  {/* Brisanje cijele kategorije iz arhive. */}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("archive.deleteCategory", {
                      category: typeName,
                    })}
                    hitSlop={8}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDark ? "#3a2020" : "#f0d8d8",
                      borderWidth: 1,
                      borderColor: isDark ? "#5a3030" : "#d0a0a0",
                    }}
                    onPress={() =>
                      Alert.alert(
                        t("archive.deleteCategory", { category: typeName }),
                        t("archive.deleteCategoryConfirm", {
                          category: typeName,
                          count: inType.length,
                        }),
                        [
                          { text: t("common.cancel"), style: "cancel" },
                          {
                            text: t("common.remove"),
                            style: "destructive",
                            onPress: () => {
                              onDeleteVisits(inType.map((v) => v.id));
                              if (filter === type) setFilter(null);
                            },
                          },
                        ],
                      )
                    }
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={isDark ? "#e08080" : "#a03030"}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Prazan state */}
        {filtered.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              backgroundColor: DC.bg,
            }}
          >
            <Text style={{ fontSize: 64 }}>🗺️</Text>
            <Text
              style={{ fontSize: T.title, fontWeight: "700", color: DC.text }}
            >
              {visits.length === 0 ? t("map.noPlaces") : t("common.noResults")}
            </Text>
            <Text
              style={{
                fontSize: T.body,
                color: DC.textDim,
                textAlign: "center",
                paddingHorizontal: 40,
              }}
            >
              {visits.length === 0
                ? t("archive.markHint")
                : t("archive.noFilterResults")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={{ backgroundColor: DC.bg }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            renderItem={({ item }) => {
              const cat =
                placeCategories[item.placeType as keyof typeof placeCategories];
              const color = cat?.color || V.silverDim;
              return (
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: DC.card,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    gap: 12,
                    borderWidth: 1,
                    borderColor: DC.borderDim,
                    borderLeftWidth: 4,
                    borderLeftColor: color,
                  }}
                  onPress={() => {
                    onSelectVisit(item);
                    onClose();
                  }}
                >
                  {/* Ikona kategorije */}
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 10,
                      backgroundColor: color + "33",
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: color + "66",
                    }}
                  >
                    <Text style={{ fontSize: T.screen }}>
                      {EMOJIS[item.placeType] || "📍"}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: T.body,
                        fontWeight: "700",
                        color: DC.text,
                      }}
                      numberOfLines={1}
                    >
                      {item.placeName}
                    </Text>
                    {item.address ? (
                      <Text
                        style={{
                          fontSize: T.meta,
                          color: DC.textDim,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        📍 {item.address}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        fontSize: T.meta,
                        color: DC.accent,
                        marginTop: 4,
                        fontWeight: "600",
                      }}
                    >
                      ✓{" "}
                      {new Date(item.visitedAt).toLocaleDateString("hr-HR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>

                  {/* Delete gumb */}
                  <TouchableOpacity
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: isDark ? "#3a2020" : "#f0d8d8",
                      borderWidth: 1,
                      borderColor: isDark ? "#5a3030" : "#d0a0a0",
                    }}
                    onPress={() =>
                      Alert.alert(
                        t("map.hidePlace"),
                        `${t("map.hidePlaceConfirm", { name: item.placeName })}`,
                        [
                          { text: t("common.cancel"), style: "cancel" },
                          {
                            text: t("common.remove"),
                            style: "destructive",
                            onPress: () => onDeleteVisit(item.id),
                          },
                        ],
                      )
                    }
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={isDark ? "#e08080" : "#a03030"}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Badges Modal ─────────────────────────────────────────────────────────────
function BadgesModal({
  visible,
  onClose,
  visits,
  getAllCategories,
}: {
  visible: boolean;
  onClose: () => void;
  visits: VisitRecord[];
  getAllCategories: () => {
    id: string;
    name: string;
    icon: string;
    color: string;
  }[];
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDashColors(isDark);
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (visible) loadJSON<Badge[]>(STORAGE_BADGES, []).then(setBadges);
  }, [visible]);

  const counts: Record<string, number> = {};
  visits.forEach((v) => {
    counts[v.placeType] = (counts[v.placeType] || 0) + 1;
  });

  const totalBadges = badges.length;
  const totalVisits = visits.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: DC.bg }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 20,
            paddingTop: Platform.OS === "ios" ? 54 : 36,
            borderBottomWidth: 1.5,
            borderBottomColor: DC.border,
            backgroundColor: DC.bg,
          }}
        >
          <Text
            style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
          >
            {t("map.badges")}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text
              style={{ fontSize: T.body, color: DC.textDim, fontWeight: "600" }}
            >
              {t("common.close")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary stats */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            padding: 16,
            paddingBottom: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: DC.card,
              borderRadius: 14,
              padding: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: DC.borderDim,
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: "900", color: DC.accent }}>
              {totalVisits}
            </Text>
            <Text style={{ fontSize: T.meta, color: DC.textDim, marginTop: 2 }}>
              {t("badges.totalVisits")}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: DC.card,
              borderRadius: 14,
              padding: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: DC.borderDim,
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: "900", color: "#f0c040" }}>
              {totalBadges}
            </Text>
            <Text style={{ fontSize: T.meta, color: DC.textDim, marginTop: 2 }}>
              {t("badges.earnedBadges")}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          style={{ backgroundColor: DC.bg }}
        >
          {getAllCategories().map((cat) => {
            const count = counts[cat.id] || 0;
            const earned = BADGE_T.filter((threshold) =>
              badges.find(
                (b) => b.category === cat.id && b.level === threshold,
              ),
            );
            const next = BADGE_T.find((threshold) => count < threshold);
            const progress = next ? count / next : 1;
            const hasAnyBadge = earned.length > 0;

            return (
              <View
                key={cat.id}
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: hasAnyBadge ? cat.color + "88" : DC.borderDim,
                  borderLeftWidth: 4,
                  borderLeftColor: hasAnyBadge ? cat.color : DC.borderDim,
                  overflow: "hidden",
                }}
              >
                {/* Card header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    gap: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: DC.borderDim,
                  }}
                >
                  {/* Category icon */}
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      backgroundColor: hasAnyBadge
                        ? cat.color + "33"
                        : "#1a2e1a",
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: hasAnyBadge
                        ? cat.color + "66"
                        : DC.borderDim,
                    }}
                  >
                    <CategoryCoin
                      id={cat.id}
                      fallbackGlyph={cat.icon}
                      size={44}
                    />
                  </View>

                  {/* Name + count */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: T.body,
                        fontWeight: "800",
                        color: DC.text,
                      }}
                    >
                      {cat.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: T.meta,
                        color: DC.accent,
                        marginTop: 2,
                        fontWeight: "600",
                      }}
                    >
                      {t("badges.visitCount", { count })}
                    </Text>
                    {next && (
                      <Text
                        style={{
                          fontSize: T.caption,
                          color: DC.accent,
                          marginTop: 1,
                        }}
                      >
                        {t("badges.nextBadgeIn", { count: next - count })}
                      </Text>
                    )}
                    {!next && count > 0 && (
                      <Text
                        style={{
                          fontSize: T.caption,
                          color: "#f0c040",
                          marginTop: 1,
                          fontWeight: "700",
                        }}
                      >
                        🏆 {t("badges.allEarned")}
                      </Text>
                    )}
                  </View>

                  {/* Earned count badge */}
                  {hasAnyBadge && (
                    <View
                      style={{
                        backgroundColor: cat.color + "33",
                        borderRadius: 20,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderWidth: 1.5,
                        borderColor: cat.color,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: T.meta,
                          color: cat.color,
                          fontWeight: "800",
                        }}
                      >
                        ×{earned.length}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Progress bar */}
                {count > 0 && next && (
                  <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
                    <View
                      style={{
                        height: 6,
                        backgroundColor: DC.bg,
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.min(progress * 100, 100)}%`,
                          backgroundColor: cat.color,
                          borderRadius: 3,
                        }}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 10,
                        color: DC.accent,
                        marginTop: 4,
                        textAlign: "right",
                      }}
                    >
                      {count}/{next}
                    </Text>
                  </View>
                )}

                {/* Badge pills */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    padding: 14,
                    paddingTop: count > 0 && next ? 8 : 14,
                    flexWrap: "wrap",
                  }}
                >
                  {BADGE_T.map((threshold) => {
                    const isEarned = earned.includes(threshold);
                    const badgeName = badgeTitle(t, cat.id, threshold);
                    return (
                      <View
                        key={threshold}
                        style={{
                          borderRadius: 10,
                          paddingHorizontal: 6,
                          paddingVertical: 6,
                          backgroundColor: isEarned ? cat.color : DC.bg,
                          borderWidth: 1,
                          borderColor: isEarned ? cat.color : DC.borderDim,
                          alignItems: "center",
                          minWidth: 84, // ← povećano s 52 na 60
                        }}
                      >
                        <Text
                          style={{
                            color: isEarned ? "#fff" : DC.textDim,
                            fontSize: T.caption,
                            fontWeight: "800",
                          }}
                        >
                          {isEarned ? "🏆" : "🔒"} {threshold}×
                        </Text>
                        {isEarned && badgeName && (
                          <Text
                            numberOfLines={1}
                            style={{
                              color: "rgba(255,255,255,0.85)",
                              fontSize: 9,
                              fontWeight: "600",
                              marginTop: 2,
                              textAlign: "center",
                            }}
                          >
                            {badgeName.split(" ").slice(0, 1).join(" ")}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const CELL_W = (SW - 32 - 4) / 2;
// Ploča: 4 kategorije u redu (umjesto 2) — pola manje listanja.
const CAT_GAP = 6;
const CAT_CELL_W = Math.floor((SW - 32 - CAT_GAP * 3) / 4);
const TIME_CATS: Record<string, string[]> = {
  jutro: ["cafe", "park", "landmark", "museum", "market"],
  poslijepodne: ["restaurant", "museum", "beach", "cinema", "opg", "market"],
  vecer: ["club", "cafe", "theater", "restaurant", "spa"],
};

// const visitedIcon = require("../../assets/images/posmjesta.png");
// const planIcon = require("../../assets/images/put.png");
// const groupsIcon = require("../../assets/images/grupe.png");
// const badgesIcon = require("../../assets/images/uspjeh.png");
// const notificationsIcon = require("../../assets/images/obav.png");
// const archiveIcon = require("../../assets/images/arhiva.png"); // Za arhivu posjeta
// const locationPinIcon = require("../../assets/images/igla.png"); // Za crvenu iglu (trenutna lokacija)
// const radiusIcon = require("../../assets/images/radijus.png"); // Za radijus na karti

function MapCtrlTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <View style={{ position: "relative" }}>
      <TouchableOpacity
        onPress={() => setShow(false)}
        onLongPress={() => setShow(true)}
        delayLongPress={300}
      >
        {children}
      </TouchableOpacity>
      {show && (
        <View
          style={{
            position: "absolute",
            right: 52,
            top: 10,
            backgroundColor: "rgba(20,40,20,0.92)",
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: "#5a8a48",
            zIndex: 999,
          }}
          pointerEvents="none"
        >
          <Text
            style={{
              color: "#d0f0a0",
              fontSize: T.meta,
              fontWeight: "700",
              // whiteSpace: "nowrap",
            }}
          >
            {label}
          </Text>
          {/* Mali trokut desno */}
          <View
            style={{
              position: "absolute",
              right: -6,
              top: 10,
              width: 0,
              height: 0,
              borderTopWidth: 5,
              borderBottomWidth: 5,
              borderLeftWidth: 6,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderLeftColor: "#5a8a48",
            }}
          />
        </View>
      )}
    </View>
  );
}

function QuickCategoryBar({
  allPlaces,
  selectedTypes,
  focusedType,
  onToggle,
  DC,
  t,
}: {
  allPlaces: Place[];
  selectedTypes: string[];
  focusedType: string | null;
  onToggle: (type: string) => void;
  DC: ReturnType<typeof getDashColors>;
  t: (key: string, opts?: any) => string;
}) {
  // Broji koliko mjesta ima po kategoriji u trenutnim rezultatima
  const countByType = useMemo(() => {
    const map: Record<string, number> = {};
    allPlaces.forEach((p) => {
      map[p.type] = (map[p.type] || 0) + 1;
    });
    return map;
  }, [allPlaces]);

  // Prikaži samo kategorije koje su odabrane ILI imaju rezultata
  const visibleCats = useMemo(() => {
    // Prikaži samo kategorije koje IMAJU rezultata na karti
    return Object.keys(countByType)
      .filter((id) => countByType[id] > 0)
      .filter((id) => placeCategories[id as keyof typeof placeCategories]);
  }, [countByType]);

  if (visibleCats.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{
        position: "absolute",
        bottom: 16,
        left: 0,
        right: 0,
      }}
      contentContainerStyle={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 6,
      }}
    >
      {visibleCats.map((catId) => {
        const isOn = selectedTypes.includes(catId);
        const isFocused = focusedType === catId;
        const count = countByType[catId] || 0;
        const cat = placeCategories[catId as keyof typeof placeCategories];
        const color = cat?.color || V.silverDim;
        const icon = CATEGORY_ICONS[catId];

        return (
          <TouchableOpacity
            key={catId}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: isFocused
                ? color
                : isOn
                  ? "rgba(20,40,20,0.92)"
                  : "rgba(255,255,255,0.92)",
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 6,

              borderColor: isFocused
                ? color
                : isOn
                  ? color
                  : "rgba(0,0,0,0.08)",
              borderWidth: isFocused ? 2.5 : 1.5,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 4,
            }}
            onPress={() => onToggle(catId)}
          >
            {icon ? (
              <Image
                source={icon}
                style={{ width: 18, height: 18 }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ fontSize: T.body }}>{EMOJIS[catId] || "📍"}</Text>
            )}
            <Text
              style={{
                fontSize: T.caption,
                fontWeight: "700",
                color: isFocused ? "#fff" : isOn ? "#c0e8a0" : "#333",
              }}
            >
              {t(`categories.${catId}`, { defaultValue: catId })}
            </Text>
            {count > 0 && (
              <View
                style={{
                  backgroundColor: isOn ? color : "rgba(0,0,0,0.12)",
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  minWidth: 18,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color: isOn ? "#fff" : "#444",
                  }}
                >
                  {count > 99 ? "99+" : count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// Tumačenje radnog vremena preseljeno je u utils/openingHours (isOpenAt) i
// pokriveno testovima: ovdašnja verzija nije prepoznavala podijeljeno radno
// vrijeme ("08:00-12:00,17:00-20:00"), raspone dana koji prelaze kraj tjedna
// ("Su-Th") ni višak ključnih riječi, pa je otvorene lokale znala prikazati
// kao zatvorene i obratno.

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDashColors(isDark);
  // POST_CATEGORY_IDS, a ne samo placeCategories: "Ostalo" nije vrsta mjesta
  // na karti pa ga tamo nema, ali je kategorija kao i svaka druga — bez nje
  // je na ploči nedostajala, a objave svrstane pod "Ostalo" nije se imalo
  // čime filtrirati ni pratiti.
  const getAllCategories = useCallback(() => {
    return POST_CATEGORY_IDS.map((id) => ({
      id,
      name: t(`categories.${id}`, { defaultValue: id }),
      icon: EMOJIS[id] || "📍",
      color:
        placeCategories[id as keyof typeof placeCategories]?.color || "#7A8A75",
    }));
  }, [t]);
  const [categoryQuery, setCategoryQuery] = useState("");
  // Pretraga kategorija na ploči: bez obzira na velika/mala slova i dijakritike.
  const visibleCategories = useMemo(() => {
    const norm = (v: string) =>
      v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const q = norm(categoryQuery);
    const all = getAllCategories();
    return q ? all.filter((c) => norm(c.name).includes(q)) : all;
  }, [getAllCategories, categoryQuery]);
  const mapRef = useRef<MapView>(null);
  const permissionRequestInProgress = useRef(false);
  const hasShownPermissionAlert = useRef(false);
  const hasRequestedLocationOnce = useRef(false);

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  // Dodaj uz ostale state-ove:
  // Broj nepročitanih obavijesti. Ranije se postavljao na 0 i NIKAD se nije
  // mijenjao, pa je značka na zvonu bila trajno prazna bez obzira na sve.
  const [realNotificationCount, setRealNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchLocation, setSearchLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [searchLocationName, setSearchLocationName] = useState<string>("");
  const [cityQuery, setCityQuery] = useState("");
  const [citySearching, setCitySearching] = useState(false);
  const [circleBeforeDetail, setCircleBeforeDetail] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  // Postaje true kad je izbor kategorija pročitan iz pohrane. Do tada se
  // ništa ne sprema, inače bi početni [] pregazio spremljeni izbor.
  const typesLoadedRef = useRef(false);
  const [radius, setRadius] = useState(5);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  // Zapamćen radijus iz prošlog korištenja.
  useEffect(() => {
    loadJSON<number>(STORAGE_RADIUS, 5).then((r) => {
      if ((RADIUS_CHOICES as readonly number[]).includes(r)) setRadius(r);
    });
  }, []);
  const chooseRadius = useCallback((km: number) => {
    setRadius(km);
    saveJSON(STORAGE_RADIUS, km);
  }, []);
  // Svi pronađeni rezultati (neograničeni)
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  // Broj koji se prikazuje na karti
  const [displayLimit, setDisplayLimit] = useState(INITIAL_RESULTS_LIMIT);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  // Prvi rezultati su već na karti, ali drugi izvor još dopunjuje popis.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Sekunde otkad traje učitavanje — da se vidi da aplikacija radi, a ne visi.
  const [loadSeconds, setLoadSeconds] = useState(0);
  useEffect(() => {
    if (!isLoadingPlaces) {
      setLoadSeconds(0);
      return;
    }
    const id = setInterval(() => setLoadSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isLoadingPlaces]);
  // Ishod zadnjeg dohvata: za koji je izbor i je li izvor zakazao. Bez toga
  // se "još učitavam" i "nema ničega" ne mogu razlikovati — oba su bila 0/0.
  const [lastLoad, setLastLoad] = useState<{
    key: string;
    failed: boolean;
  } | null>(null);
  // Redni broj zadnjeg zahtjeva; stariji odgovori koji stignu kasnije ignoriraju se.
  const loadSeqRef = useRef(0);
  const [activeTimeOfDay, setActiveTimeOfDay] = useState<string | null>(null);

  const [todHint, setTodHint] = useState<string | null>(null);
  const todHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTodHint = async (key: string, text: string) => {
    const seenRaw = await AsyncStorage.getItem("tod_hint_seen_count");
    const seen = parseInt(seenRaw || "0");
    if (seen >= 3) return; // nakon 3 prikaza više ne pokazuj
    if (todHintTimer.current) clearTimeout(todHintTimer.current);
    setTodHint(text);
    todHintTimer.current = setTimeout(() => setTodHint(null), 2800);
    await AsyncStorage.setItem("tod_hint_seen_count", String(seen + 1));
  };

  const [searchQuery, setSearchQuery] = useState("");
  /**
   * Objave oko mjesta koje se trenutno gleda na karti.
   *
   * "Blizu mene" u videima mjeri od krajeva u kojima se korisnik inače
   * kreće — tko dođe u nepoznat grad time ne dobiva ništa. Ovdje se pita
   * što je objavljeno oko točke na koju je karta namještena, bila to
   * pretraga ili obično pomicanje.
   */
  const [areaSheetPoint, setAreaSheetPoint] = useState<AreaPoint | null>(null);
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showPlanMyDay, setShowPlanMyDay] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showOstalo, setShowOstalo] = useState(false);
  const [showMapCtrlPanel, setShowMapCtrlPanel] = useState(true);
  const [focusedType, setFocusedType] = useState<string | null>(null);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showPlaceDetail, setShowPlaceDetail] = useState(false);

  const [showRadiusCircle, setShowRadiusCircle] = useState(true);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [showOnlyVisited, setShowOnlyVisited] = useState(false);
  const skipVisitedFitRef = useRef(false);
  const [hiddenPlaceIds, setHiddenPlaceIds] = useState<string[]>([]);

  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);

  // Izbrišite gornju konstantu i dodajte OVO unutar DashboardScreen komponente:
  const getAgeGroups = useCallback(() => {
    return [
      {
        id: "minors",
        label: t("ageGroups.minors"),
        emoji: "👦",
        icon: maloletnikIcon, // ← dodaj
        desc: "< 18",
        cats: ["park", "cinema", "beach", "museum", "escapeRoom"],
        color: "#3498DB",
      },
      {
        id: "youth",
        label: t("ageGroups.youth"),
        emoji: "🧑",
        icon: mladiIcon, // ← dodaj
        desc: "18–25",
        cats: [
          "club",
          "cinema",
          "beach",
          "escapeRoom",
          "paintball",
          "park",
          "cafe",
        ],
        color: "#9B59B6",
      },
      {
        id: "students",
        label: t("ageGroups.students"),
        emoji: "🎓",
        icon: studentIcon, // ← dodaj
        desc: t("ageGroups.studentDesc"),
        cats: [
          "cafe",
          "cinema",
          "museum",
          "theater",
          "park",
          "escapeRoom",
          "restaurant",
        ],
        color: V.visited,
      },
      {
        id: "adults",
        label: t("ageGroups.adults"),
        emoji: "👔",
        icon: odrasliIcon, // ← dodaj
        desc: "26–60",
        cats: [
          "restaurant",
          "cafe",
          "spa",
          "theater",
          "museum",
          "landmark",
          "market",
          "accommodation",
        ],
        color: "#E67E22",
      },
      {
        id: "retired",
        label: t("ageGroups.retired"),
        emoji: "👴",
        icon: umirovljenikIcon, // ← dodaj
        desc: "60+",
        cats: [
          "restaurant",
          "cafe",
          "spa",
          "museum",
          "landmark",
          "park",
          "market",
        ],
        color: "#27AE60",
      },
    ];
  }, [t]);

  // Logika filtriranja po dobi (dodaj ISPOD deklaracije `places`):
  // Promijenite ovisnosti za ageAllowedCats:
  const ageAllowedCats = useMemo(() => {
    if (selectedAgeGroups.length === 0) return null;
    return [
      ...new Set(
        selectedAgeGroups.flatMap(
          (gId) => getAgeGroups().find((g) => g.id === gId)?.cats ?? [],
        ),
      ),
    ];
  }, [selectedAgeGroups, getAgeGroups]);

  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    appEnabled: false,
    emailEnabled: false,
    email: "",
    categories: [],
  });

  // Izbor kategorija se pamti između pokretanja. Mijenja se s više mjesta
  // (ploča kategorija, dobne skupine, doba dana, "očisti sve"), pa se sprema
  // ovdje umjesto u svakom od njih.
  useEffect(() => {
    if (!typesLoadedRef.current) return;
    saveJSON(STORAGE_TYPES, selectedTypes);
  }, [selectedTypes]);

  const activeSearchLoc = searchLocation || userLocation;

  // Helper za redoslijed po dobu dana (iznad timeFiltered):
  function isCategoryOpenInWindow(
    type: string,
    windowFrom: number,
    windowTo: number,
    dayOfWeek: number,
  ): boolean {
    const ranges = CATEGORY_HOURS[type];
    if (!ranges) return true;
    const day = dayOfWeek;

    return ranges.some(({ open, close, days }) => {
      if (days !== undefined && !days.includes(day)) return false;

      if (close <= 24) {
        // Normalni interval — provjeri preklapanje s [windowFrom, windowTo]
        return windowFrom < close && windowTo > open;
      } else {
        // Prelazi ponoć (npr. club 23–28 = 23:00–04:00)
        // Interval [23, 28] prekriva se s [18, 24] ako je 23 < 24
        return windowFrom < close - 24 || windowTo > open;
      }
    });
  }

  // Filtriranje po dobu dana.
  //
  // Pita se "radi li ovo mjesto U ODABRANOM RAZDOBLJU", a ne "radi li baš
  // sada" — inače bi odabir "navečer" u 19:29 izbacio svaki klub i kazalište
  // koji tek otvara.
  //
  // Skriva se SAMO mjesto za koje je radno vrijeme zapisano i kaže da je u tom
  // razdoblju zatvoreno. Mjesto bez podatka ostaje vidljivo (označeno kao
  // "nepotvrđeno") — prije ga je skrivala gruba tablica tipičnih sati po
  // kategoriji, pa su kad god nitko nije imao zapisano radno vrijeme svi
  // klubovi izlazili kao zatvoreni od nedjelje do srijede, a brojač je
  // pokazivao 0/0. Ta se tablica sada koristi samo za redoslijed: potvrđeno
  // otvorena mjesta idu prva, pa ona koja će vjerojatno biti otvorena.
  const timeFiltered = useMemo(() => {
    const none = new Set<string>();
    if (!activeTimeOfDay) return { places: allPlaces, unconfirmed: none };

    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const dayOfWeek = now.getDay();
    const tod = TOD_HOURS[activeTimeOfDay];
    if (!tod) return { places: allPlaces, unconfirmed: none };

    const windowIncludesNow = nowH >= tod.from && nowH < tod.to;

    const confirmed: Place[] = [];
    const likely: Place[] = [];
    const unlikely: Place[] = [];
    const unconfirmed = new Set<string>();

    for (const p of allPlaces) {
      const stated = isOpenDuringWindow(p.openingHours, now, tod.from, tod.to);
      if (stated === false) continue; // zapisano: u tom razdoblju ne radi
      if (stated === true || (windowIncludesNow && p.openNow === true)) {
        confirmed.push(p);
        continue;
      }
      unconfirmed.add(p.id);
      if (isCategoryOpenInWindow(p.type, tod.from, tod.to, dayOfWeek)) {
        likely.push(p);
      } else {
        unlikely.push(p);
      }
    }

    return {
      places: [...confirmed, ...likely, ...unlikely],
      unconfirmed,
    };
  }, [allPlaces, activeTimeOfDay]);

  const places = timeFiltered.places;

  const initialRegion: Region = {
    latitude: 45.815,
    longitude: 15.9819,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  useEffect(() => {
    // 1. Odmah učitaj iz lokalnog cache-a
    loadJSON<VisitRecord[]>(STORAGE_VISITS, []).then((cached) => {
      if (cached.length > 0) setVisits(cached);
    });

    // 2. Sinkroniziraj s backendom u pozadini
    backendGetVisits()
      .then((sv) => {
        if (sv.length > 0) {
          setVisits(sv);
          saveJSON(STORAGE_VISITS, sv);
        }
      })
      .catch(() => {});

    loadJSON<string[]>(STORAGE_HIDDEN, []).then(setHiddenPlaceIds);

    // null (a ne []) znači "korisnik još nije ništa birao" — tek tada se
    // koriste zadane kategorije. Prazan spremljeni popis je valjan izbor
    // (korisnik ih je sve maknuo) i ne prepisuje se.
    loadJSON<string[] | null>(STORAGE_TYPES, null).then((stored) => {
      // Ako je korisnik stigao nešto odabrati prije nego je čitanje
      // završilo, njegov izbor ima prednost.
      if (typesLoadedRef.current) return;
      typesLoadedRef.current = true;

      if (stored === null) {
        setSelectedTypes(DEFAULT_TYPES);
        saveJSON(STORAGE_TYPES, DEFAULT_TYPES);
      } else {
        setSelectedTypes(stored);
      }
    });
    // Lokalna kopija se iscrta odmah, a zatim je zamjenjuje ono što stvarno
    // stoji na poslužitelju — jer o tome ovisi hoće li obavijesti uopće stizati.
    loadJSON<NotifPrefs>(STORAGE_NOTIFS, {
      appEnabled: false,
      emailEnabled: false,
      email: "",
      categories: [],
    }).then(setNotifPrefs);

    getNotificationPreferences().then((remote) => {
      if (!remote) return;
      const merged: NotifPrefs = {
        appEnabled: remote.appEnabled,
        emailEnabled: remote.emailEnabled,
        email: remote.email,
        categories: remote.categories,
        globalEnabled: remote.globalEnabled,
        radiusKm: remote.radiusKm,
      };
      setNotifPrefs(merged);
      saveJSON(STORAGE_NOTIFS, merged);
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        Location.getForegroundPermissionsAsync().then(({ status }) => {
          if (status === "granted" && !locationPermission) {
            setLocationPermission(true);
            getLocationFast();
          }
        });
      }
    });
    return () => sub.remove();
  }, [locationPermission]);

  useFocusEffect(
    useCallback(() => {
      if (!hasRequestedLocationOnce.current) {
        hasRequestedLocationOnce.current = true;
        requestLocationPermission();
      }
      getUnreadCount().then(setRealNotificationCount);
    }, []),
  );

  // Osvježavanje brojača staje kad aplikacija ode u pozadinu (useActivePolling).
  useActivePolling(() => {
    getUnreadCount().then(setRealNotificationCount);
  }, 90000);

  // PRONAĐI useEffect koji resetira displayLimit:
  useEffect(() => {
    if (!activeSearchLoc || selectedTypes.length === 0 || showOnlyVisited) {
      loadSeqRef.current++; // odbaci odgovor koji je možda još u letu
      setAllPlaces([]);
      setLastLoad(null);
      setIsLoadingPlaces(false);
      setIsLoadingMore(false);
      return;
    }

    const timer = setTimeout(loadPlacesInRadius, 250);
    return () => clearTimeout(timer);
  }, [
    activeSearchLoc?.latitude,
    activeSearchLoc?.longitude,
    radius,
    selectedTypes.join(","),
    showOnlyVisited,
  ]);

  // ── BRZA LOKACIJA ──────────────────────────────────────────────────────────
  // Korak 1: Balanced (brzo ~1-3s) → odmah centrira kartu
  // Korak 2: High (točno, 5-10s) → tiho ažurira u pozadini
  const requestLocationPermission = async () => {
    if (permissionRequestInProgress.current) return;
    permissionRequestInProgress.current = true;

    try {
      const { status: currentStatus, canAskAgain } =
        await Location.getForegroundPermissionsAsync();

      let finalStatus = currentStatus;

      if (
        currentStatus === Location.PermissionStatus.UNDETERMINED &&
        canAskAgain
      ) {
        const req = await Location.requestForegroundPermissionsAsync();
        finalStatus = req.status;
      }

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        setTimeout(() => {
          if (!hasShownPermissionAlert.current) {
            hasShownPermissionAlert.current = true;
            Alert.alert(
              t("map.locationRequiredTitle"),
              t("map.locationRequiredMsg"),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("map.openSettings"),
                  onPress: () => {
                    hasShownPermissionAlert.current = false;
                    Linking.openSettings();
                  },
                },
              ],
            );
          }
        }, 400);
        return;
      }

      hasShownPermissionAlert.current = false;
      setLocationPermission(true);
      getLocationFast();
    } finally {
      permissionRequestInProgress.current = false;
    }
  };

  const getLocationFast = async () => {
    // Prikaži zadnju poznatu (keširanu) lokaciju ODMAH — to je gotovo
    // trenutno jer ne čeka novi GPS fix. Prije se čekao pravi
    // getCurrentPositionAsync prije ikakvog prikaza na karti, što je na
    // slabijem signalu ili u zatvorenom prostoru znalo trajati nekoliko
    // sekundi praznog/centriranog ekrana.
    //
    // ✅ FIX: dosad je applyLocation (svaki put s animateToRegion letom
    // kamere) zvan i do 3 puta zaredom — jednom za keširanu, jednom za
    // "Balanced" i jednom za "High" preciznost, svaki put na blago
    // drukčije koordinate. Tri preklapajuća 800ms leta kamere u manje od
    // sekunde izgledaju kao da se ekran "trese"/vibrira. Sad kamera leti
    // SAMO na prvi uspješan fix — svaki sljedeći, precizniji fix samo tiho
    // ažurira userLocation/mapRegion (za plavu točku i buduće pretrage)
    // bez ponovnog pomicanja kamere.
    let shownFromCache = false;
    let hasCenteredCamera = false;
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        applyLocation(
          lastKnown.coords.latitude,
          lastKnown.coords.longitude,
          true,
        );
        shownFromCache = true;
        hasCenteredCamera = true;
      }
    } catch {}

    try {
      const fastLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      applyLocation(
        fastLoc.coords.latitude,
        fastLoc.coords.longitude,
        !hasCenteredCamera,
      );
      hasCenteredCamera = true;

      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then((precLoc) => {
          applyLocation(
            precLoc.coords.latitude,
            precLoc.coords.longitude,
            false,
          );
        })
        .catch(() => {});
    } catch {
      // Već prikazujemo keširanu lokaciju — svježi fix u pozadini nije
      // uspio, ali korisnik nije gledao u prazan ekran u međuvremenu.
      if (shownFromCache) return;

      // Pričekaj i pokušaj još jednom prije nego prikažeš alert
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const retryLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        applyLocation(
          retryLoc.coords.latitude,
          retryLoc.coords.longitude,
          !hasCenteredCamera,
        );
      } catch {
        // Tek sada, nakon svih pokušaja, tiho odustani bez alarmantnog alerta
        // (korisnik uvijek može ručno kliknuti "Moja lokacija" gumb na karti)
        console.log("Location fetch failed after retries");
      }
    }
  };

  const applyLocation = (
    latitude: number,
    longitude: number,
    animateCamera: boolean = true,
  ) => {
    setUserLocation({ latitude, longitude });
    const region = {
      latitude,
      longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    setMapRegion(region);
    if (animateCamera) {
      mapRef.current?.animateToRegion(region, 800);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      applyLocation(loc.coords.latitude, loc.coords.longitude);
    } catch {
      // GPS možda još nije spreman — pokušaj zadnju poznatu lokaciju
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          applyLocation(lastKnown.coords.latitude, lastKnown.coords.longitude);
          return;
        }
      } catch {}

      // Pričekaj 5s i pokušaj ponovno prije nego pokažeš grešku
      try {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const retryLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        applyLocation(retryLoc.coords.latitude, retryLoc.coords.longitude);
      } catch {
        // Tek nakon svih pokušaja pokaži alert
        Alert.alert(t("common.error"), t("map.locationError"));
      }
    }
  };

  const handleCitySearch = async () => {
    if (!cityQuery.trim()) return;
    setCitySearching(true);
    try {
      const result = await geocodeCity(cityQuery.trim());
      if (!result) {
        Alert.alert(
          t("common.noResults"),
          `${t("common.noResults")}: "${cityQuery}"`,
        );
        return;
      }
      setSearchLocation({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      setSearchLocationName(result.displayName);
      // Predmemorija se ne briše: ključ sadrži koordinate, pa se nova lokacija
      // ionako učitava svježe, a brisanje bi bacilo i sve ostalo učitano.
      const region = {
        latitude: result.latitude,
        longitude: result.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 1000);
      Alert.alert(
        t("map.locationChanged"),
        t("map.searchingAround", { name: result.displayName }),
      );
    } catch {
      Alert.alert(t("common.error"), t("map.locationError"));
    } finally {
      setCitySearching(false);
    }
  };

  const clearCitySearch = () => {
    setSearchLocation(null);
    setSearchLocationName("");
    setCityQuery("");
    setAllPlaces([]); // ← NOVO: očisti stare rezultate
    if (userLocation) {
      const region = {
        ...userLocation,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setMapRegion(region);
      mapRef.current?.animateToRegion(region, 800);
    }
  };

  const loadPlacesInRadius = async () => {
    if (!activeSearchLoc || selectedTypes.length === 0) return;
    const seq = ++loadSeqRef.current;
    const loadKey = `${selectedTypes.join(",")}|${activeSearchLoc.latitude.toFixed(3)},${activeSearchLoc.longitude.toFixed(3)}|${radius}`;
    let sourceFailed = false;
    const tLoad = Date.now();
    if (__DEV__) {
      console.log(
        `[map] loading ${selectedTypes.length} categories (${selectedTypes.join(",")}), radius ${radius} km, Google key: ${GOOGLE_KEY ? "yes" : "NO"}`,
      );
    }
    setIsLoadingPlaces(true);
    setIsLoadingMore(true);
    // Čuvar: ako išta ispod zapne (poslužitelj, mreža, tijelo odgovora koje ne
    // stiže), traka ne smije vrtjeti beskrajno — nudi se "Ponovi". Kasniji
    // rezultati se i dalje prikažu ako ipak stignu.
    const watchdog = setTimeout(() => {
      if (seq !== loadSeqRef.current) return;
      if (__DEV__) console.log("[map] watchdog: giving up waiting after 25s");
      setIsLoadingPlaces(false);
      setIsLoadingMore(false);
      setLastLoad({ key: loadKey, failed: true });
    }, LOAD_WATCHDOG_MS);
    try {
      // Dva izvora rade ISTODOBNO. Google je obično gotov za ~1 s, OSM zna
      // trajati puno dulje — prije se čekalo jedno pa drugo i tek onda išta
      // pokazalo ("Učitavam mjesta…" bez kraja). Sad se prikaže ono što
      // prvo stigne, a drugi izvor ga nadopuni.
      const googleP: Promise<Place[]> = GOOGLE_KEY
        ? fetchGoogleNearby(
            GOOGLE_KEY,
            activeSearchLoc.latitude,
            activeSearchLoc.longitude,
            radius * 1000,
            selectedTypes,
          ).catch(() => [])
        : Promise.resolve([]);
      const osmP = getPlacesInRadiusDetailed(
        activeSearchLoc.latitude,
        activeSearchLoc.longitude,
        radius,
        selectedTypes as any,
      );

      // Spajanje, deduplikacija i filtri po kategorijama. Zove se i za prvi
      // (djelomični) prikaz i za završni.
      const buildList = (combined: Place[]): Place[] => {
        const seen = new Map<string, Place>();
        const deduped: Place[] = [];

        for (const p of combined) {
          if (hiddenPlaceIds.includes(p.id)) continue;

          const dist = haversineKm(
            activeSearchLoc.latitude,
            activeSearchLoc.longitude,
            p.latitude,
            p.longitude,
          );
          if (dist > radius * 1.1) continue;

          // Normalizacija — ukloni prefikse "hotel ", "hostel " itd. za bolji dedup
          const normalizeAccommodationName = (name: string): string => {
            return name
              .toLowerCase()
              .trim()
              .replace(
                /^(hotel|hostel|apartman|apartments|motel|villa|resort)\s+/i,
                "",
              )
              .replace(
                /\s+(hotel|hostel|apartman|apartments|motel|villa|resort)$/i,
                "",
              );
          };

          const museumKeywords = ["muzej", "museum", "galerija", "gallery"];
          const normalizeName = (name: string, type: string): string => {
            const n = name.toLowerCase().trim();
            if (type === "accommodation")
              return normalizeAccommodationName(name);
            if (type === "museum") {
              return n
                .replace(/^(muzej|museum|galerija|gallery)\s+/i, "")
                .replace(/\s+(muzej|museum|galerija|gallery)$/i, "")
                .replace(/\s+of\s+/gi, " ") // "Museum of Slavonia" → "slavonia"
                .replace(/\s+slavonije$/i, " slavonia") // HR→EN normalizacija
                .replace(/\s+grada\s+/gi, " ") // "Muzej grada Osijeka" → "osijeka"
                .replace(/\s+likovnih\s+/gi, " ")
                .trim();
            }
            return n;
          };

          const nameKey = normalizeName(p.name, p.type);

          const existing = seen.get(nameKey);

          if (existing) {
            const distBetween = haversineKm(
              existing.latitude,
              existing.longitude,
              p.latitude,
              p.longitude,
            );
            if (distBetween < 0.2) continue;
          }

          // ── Dodatna provjera za muzeje: isti tip + unutar 150m = duplikat
          // čak i ako se nazivi razlikuju (HR vs EN prijevodi)
          if (
            p.type === "museum" ||
            p.type === "landmark" ||
            p.type === "theater"
          ) {
            const nearDuplicate = deduped.find((existing) => {
              if (existing.type !== p.type) return false;
              return (
                haversineKm(
                  existing.latitude,
                  existing.longitude,
                  p.latitude,
                  p.longitude,
                ) < 0.15
              ); // 150 metara — isti objekt, drugačiji jezik
            });
            if (nearDuplicate) continue;
          }

          seen.set(nameKey, p);
          deduped.push(p);
        }

        // ── STROGI POST-FILTER ZA THEATER ──────────────────────────────
        const THEATER_HARD_BLOCK = [
          "hotel",
          "hostel",
          "apartman",
          "apartment",
          "apartments",
          "soba",
          "sobe",
          "rooms",
          "room",
          "guest",
          "guesthouse",
          "villa",
          "vila",
          "resort",
          "inn",
          "motel",
          "lodging",
          "accommodation",
          "smještaj",
          "bed",
          "breakfast",
          "b&b",
          "studio",
          "suite",
          "camp",
          "glamping",
          "pansion",
          "pension",
          "nekretnin",
          "centar nekretnina",
        ];

        const theaterFiltered = deduped.filter((p) => {
          if (p.type !== "theater") return true;
          const n = p.name.toLowerCase().trim();
          const isRealTheater =
            n.includes("kazalište") ||
            n.includes("kazaliste") ||
            n.includes("teatar") ||
            n.includes("theatre") ||
            n.includes("theater") ||
            n.includes("hnk") ||
            n.includes("dječje") ||
            n.includes("narodno");
          if (!isRealTheater) return false;
          return !nameMatchesDenylist(n, THEATER_HARD_BLOCK);
        });

        // ── POST-FILTER ZA CLUB ─────────────────────────────────────────
        const CLUB_HARD_BLOCK = [
          "salon za pse",
          "dog salon",
          "pet salon",
          "grooming",
          "ljubimac",
          "kućni ljubimac",
          "njega pasa",
          "uređivanje pasa",
          "šišanje pasa",
          "frizerski salon",
          "frizersk",
          "frizer",
          "hair salon",
          "brijačnica",
          "barber",
          "automat",
          "gaming",
          "slot",
          "tombola",
          "kladionica",
          "mozzart",
          "winbet",
          "superbet",
          "lvbet",
          "admiral",
          "casino",
          "kockarnica",
          "kozmetik",
          "beauty",
          "estetik",
          "nail",
          "manikur",
          "pedikur",
          "fitness",
          "gym",
          "teretana",
          "nekretnin",
          "d.o.o",
          "obrt",
        ];

        const finalFiltered = theaterFiltered.filter((p) => {
          if (p.type !== "club") return true;
          const n = p.name.toLowerCase().trim();
          return !nameMatchesDenylist(n, CLUB_HARD_BLOCK);
        });

        const LANDMARK_BLOCK = [
          "hostel",
          "hotel",
          "sobe",
          "rooms",
          "guest house",
          "guest",
          "guesthouse",
          "apartman",
          "apartment",
          "apartments",
          "studio",
          "perla",
          "waldinger",
          "prenočište",
          "smještaj",
          "accommodation",
          "lodging",
          "villa",
          "vila",
          "resort",
          "inn",
          "motel",
          "advent",
          "festival",
          "sajam",
          "wine & walk",
          "wine walk",
          "winterland",
          "muzej",
          "museum",
          "arhiv",
          "archive",
          "shell museum",
          "water world",
          "osijek",
          "zagreb",
          "split",
          "rijeka",
          "varaždin",
          "farm stay",
          "lacković",
          "biljski krokodil",
          "krokodil",
          "sakuntala", // ← DODANO
          "centar nekretnina", // ← DODANO
          "centar nekretnine", // ← DODANO
          "nekretnin", // ← DODANO
        ];

        const fullyFiltered = finalFiltered.filter((p) => {
          if (p.type !== "landmark") return true;
          const n = p.name.toLowerCase();
          return !nameMatchesDenylist(n, LANDMARK_BLOCK);
        });

        const MUSEUM_BLOCK = [
          "bridge bench",
          "bench",
          "war scarred",
          "scarred building",
          "katakomba",
          "catacomb", // ← vraćeno: blokira "Catacombs Osijek" u muzejima
          "catacombs", // ← vraćeno: Google Places vraća pod museum tipom
          "most",
          "bridge",
          "shell museum",
          "water world",
          "školjaka",
          "skoljaka",
          "building",
          "ruin",
          "ruins",
          "atrakcija",
        ];
        const museumFiltered = fullyFiltered.filter((p) => {
          if (p.type !== "museum") return true;
          const n = p.name.toLowerCase();
          return !nameMatchesDenylist(n, MUSEUM_BLOCK);
        });

        const PARK_HARD_BLOCK = [
          "fićo",
          "red fić",
          "konoba",
          "restoran",
          "caffe",
          "bar",
          "podgorje",
          "suvara",
          "kraševo",
          "krasevo",
          "bikana",
          "čimen",
          "cimen",
          "južni blok",
          "juzni blok",
          "removac",
          "removač",
          "blok",
          "naselje",
          "zaselak",
          "zaselje",
          "ulica",
          "trg",
          "cesta",
          "sa morem",
          "predio",
          "predjel",
          "zona",
          "četvrt",
          "cetvrt",
          "kvart",
        ];
        const parkFiltered = museumFiltered.filter((p) => {
          if (p.type !== "park") return true;
          const n = p.name.toLowerCase();
          return !nameMatchesDenylist(n, PARK_HARD_BLOCK);
        });

        const LANDMARK_EMPLOYMENT_BLOCK = [
          "employment service",
          "zapošljavanj",
          "zavod za zaposl",
          "hzz",
          "porezna uprava",
          "ured za",
          "državni ured",
        ];
        const landmarkExtra = parkFiltered.filter((p) => {
          if (p.type !== "landmark") return true;
          const n = p.name.toLowerCase();
          return !nameMatchesDenylist(n, LANDMARK_EMPLOYMENT_BLOCK);
        });

        // ── POST-FILTER ZA SPA — mora biti ZADNJI, nakon museumFiltered ──
        const SPA_HARD_BLOCK = [
          // Medicinsko
          "ambulanta",
          "liječnik",
          "doktor",
          "medicina",
          "medical",
          "obiteljske",
          "dežurna",
          "fizioterapi",
          "physio",
          "rehabilitaci",
          // Kozmetika — i s dijakriticima
          "beauty",
          "kozmetik",
          "kozmetičk",
          "estetik",
          "estetica",
          "estetska",
          "salon",
          "nail",
          "manikur",
          "pedikur",
          // Fitness
          "fitness",
          "gym",
          "teretana",
          "crossfit",
          "osobni trening",
          "treninzi",
          "pump",
          // Tijelo/njega
          "njegu",
          "kulture tijela",
          "centar kulture",
          "sport i njegu",
          "tensegrity",
          "wellar",
          "body service",
          "body care",
          // Studio/smještaj
          "studio",
          "apartman",
          "apartment",
          "hotel",
          "hostel",
          // Poslovno
          "obrt",
          "d.o.o",
          "nekretnin",
          "ljekarnica",
          "apoteka",
          "wellness centar",
        ];

        const spaFiltered = museumFiltered.filter((p) => {
          if (p.type !== "spa") return true;
          const n = p.name.toLowerCase();
          return !nameMatchesDenylist(n, SPA_HARD_BLOCK);
        });

        // ← DODAJ OVDJE
        const CINEMA_WHITELIST = [
          "kino",
          "cinema",
          "cinestar",
          "multiplex",
          "kinoplex",
          "cinemacity",
          "kinodvor",
          "art kino",
          "filmski",
          "imax",
        ];
        const cinemaFiltered = landmarkExtra.filter((p) => {
          if (p.type !== "cinema") return true;
          const n = p.name.toLowerCase();
          return CINEMA_WHITELIST.some((kw) => n.includes(kw));
        });
        return cinemaFiltered;
      };

      let googleList: Place[] | null = null;
      let osmResult: { places: Place[]; failed: boolean } | null = null;
      let fitted = false;

      const render = () => {
        // Odgovor na stariji izbor ne smije pregaziti noviji.
        if (seq !== loadSeqRef.current) return;
        const combined = [...(googleList ?? []), ...(osmResult?.places ?? [])];
        // Prazan djelomični rezultat ne briše prikaz — čeka se drugi izvor.
        if (combined.length === 0 && !(googleList && osmResult)) return;

        const list = buildList(combined);
        list.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
        setAllPlaces(list);
        if (list.length > 0) setIsLoadingPlaces(false);

        // Kamera se namješta samo na prvi prikaz; kasnije dopune ne smiju
        // pomicati kartu dok je korisnik već razgledava.
        if (!fitted && list.length > 0 && mapRef.current) {
          fitted = true;
          mapRef.current.fitToCoordinates(
            [
              ...list.map((p) => ({
                latitude: p.latitude,
                longitude: p.longitude,
              })),
              {
                latitude: activeSearchLoc.latitude,
                longitude: activeSearchLoc.longitude,
              },
            ],
            {
              edgePadding: { top: 110, right: 60, bottom: 150, left: 60 },
              animated: true,
            },
          );
        }
      };

      await Promise.all([
        googleP.then((list) => {
          if (__DEV__) {
            console.log(
              `[map] Google: ${list.length} places in ${Date.now() - tLoad}ms`,
            );
          }
          googleList = list;
          render();
          // Google je već pokazao mjesta: spinner "još tražim" ne mora vrtjeti
          // dok sporiji OSM ne odgovori (njegovi rezultati se i dalje dodaju).
          if (list.length > 0) {
            setTimeout(() => {
              if (seq === loadSeqRef.current) setIsLoadingMore(false);
            }, 6000);
          }
        }),
        osmP.then((res) => {
          if (__DEV__) {
            console.log(
              `[map] OSM: ${res.places.length} places${res.failed ? " (FAILED)" : ""} in ${Date.now() - tLoad}ms`,
            );
          }
          osmResult = res;
          sourceFailed = res.failed;
          render();
        }),
      ]);

      if (seq !== loadSeqRef.current) return;
      setLastLoad({ key: loadKey, failed: sourceFailed });
    } catch (e) {
      console.error(e);
      if (seq === loadSeqRef.current) {
        setLastLoad({ key: loadKey, failed: true });
      }
    } finally {
      clearTimeout(watchdog);
      if (seq === loadSeqRef.current) {
        setIsLoadingPlaces(false);
        setIsLoadingMore(false);
      }
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchPlaces(
        searchQuery,
        activeSearchLoc?.latitude,
        activeSearchLoc?.longitude,
      );
      setSearchResults(results);
      setShowSearchResults(true);
    } catch {
      Alert.alert(t("common.error"), t("common.tryAgain"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (place: Place) => {
    mapRef.current?.animateToRegion(
      {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      800,
    );
    setSearchQuery(place.name);
    setShowSearchResults(false);
    setCircleBeforeDetail(showRadiusCircle); // ← DODAJ
    setShowRadiusCircle(false); // ← DODAJ
    setSelectedPlace(place);
    setShowPlaceDetail(true);
  };

  const toggleType = useCallback((type: string) => {
    setActiveTimeOfDay(null);
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const applyTimeOfDay = (tod: string) => {
    if (activeTimeOfDay === tod) {
      setActiveTimeOfDay(null);
      setSelectedTypes([]);
      return;
    }
    setActiveTimeOfDay(tod);
    setSelectedTypes(TIME_CATS[tod] || []);
    setDisplayLimit(INITIAL_RESULTS_LIMIT);
  };

  const handleMarkVisited = async (place: Place) => {
    if (visits.find((v) => v.placeId === place.id)) {
      Alert.alert(
        t("map.markedVisited"),
        t("map.alreadyVisited", { name: place.name }),
      );
      return;
    }
    const nv: VisitRecord = {
      id: `${Date.now()}_${place.id}`,
      placeId: place.id,
      placeName: place.name,
      placeType: place.type,
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
      visitedAt: new Date().toISOString(),
    };
    const updated = [nv, ...visits];
    setVisits(updated);
    saveJSON(STORAGE_VISITS, updated); // ← DODAJ
    await backendAddVisit(nv);
    const newBadges = await checkBadges(place.type, updated);
    if (newBadges.length > 0) {
      for (const b of newBadges)
        Alert.alert(
          t("badges.newBadge"),
          t("badges.earned", {
            name: badgeTitle(t, b.category, b.level),
          }),
        );
    } else
      Alert.alert(
        t("map.markedVisited"),
        t("map.addedToArchive", { name: place.name }),
      );
  };

  const handleDeleteVisit = async (id: string) => {
    await backendDeleteVisit(id);
    const updated = visits.filter((v) => v.id !== id);
    setVisits(updated);
    saveJSON(STORAGE_VISITS, updated);
  };

  const handleDeleteVisits = async (ids: string[]) => {
    await Promise.all(ids.map((id) => backendDeleteVisit(id)));
    const gone = new Set(ids);
    const updated = visits.filter((v) => !gone.has(v.id));
    setVisits(updated);
    saveJSON(STORAGE_VISITS, updated);
  };

  const handleHidePlace = async (placeId: string) => {
    const updated = [...hiddenPlaceIds, placeId];
    setHiddenPlaceIds(updated);
    await saveJSON(STORAGE_HIDDEN, updated);
    setAllPlaces((prev) => prev.filter((p) => p.id !== placeId));
  };

  const handleRestorePlace = async (placeId: string) => {
    const updated = hiddenPlaceIds.filter((id) => id !== placeId);
    setHiddenPlaceIds(updated);
    await saveJSON(STORAGE_HIDDEN, updated);
  };

  /**
   * Spremi postavke obavijesti — na uređaj (trenutni prikaz) i na poslužitelj
   * (bez toga obavijesti nema komu slati). Ako spremanje na poslužitelj ne
   * uspije, korisniku to kažemo: tiho odustajanje bi ostavilo dojam da je sve
   * uključeno, a ništa ne bi stizalo.
   */
  const persistNotifPrefs = useCallback(
    async (next: NotifPrefs) => {
      setNotifPrefs(next);
      saveJSON(STORAGE_NOTIFS, next);
      const result = await saveNotificationPreferences({
        appEnabled: next.appEnabled,
        emailEnabled: next.emailEnabled,
        email: next.email ?? "",
        categories: next.categories,
        globalEnabled: next.globalEnabled !== false,
        // Domet se bira u videima; ovdje se samo prenosi dalje da ga
        // spremanje kategorija ne pregazi natrag na zadanih 50 km.
        radiusKm: next.radiusKm ?? 50,
      });
      if (!result.ok) {
        // Poruka ovisi o razlogu: "provjerite vezu" je beskorisno kad je
        // zapravo istekla prijava, a upravo je to najčešći slučaj.
        Alert.alert(
          t("common.error"),
          t(saveFailureMessageKey(result.reason)) + saveFailureDetail(result),
        );
      }
    },
    [t],
  );

  const handleToggleNotif = (catId: string) => {
    persistNotifPrefs({
      ...notifPrefs,
      categories: notifPrefs.categories.includes(catId)
        ? notifPrefs.categories.filter((c) => c !== catId)
        : [...notifPrefs.categories, catId],
    });
  };

  // Uključen prikaz "Posjećeno": kamera obuhvati sva posjećena mjesta. Prije
  // je karta ostajala gdje jest, pa su posjećena mjesta izvan vidljivog dijela
  // izgledala kao da ih nema.
  useEffect(() => {
    if (!showOnlyVisited) return;
    if (skipVisitedFitRef.current) {
      skipVisitedFitRef.current = false;
      return;
    }
    const pts = visits.map((v) => ({
      latitude: v.latitude,
      longitude: v.longitude,
    }));
    if (pts.length === 0) return;
    const id = setTimeout(() => {
      if (pts.length === 1) {
        mapRef.current?.animateToRegion(
          { ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
          500,
        );
      } else {
        mapRef.current?.fitToCoordinates(pts, {
          edgePadding: { top: 160, right: 60, bottom: 160, left: 60 },
          animated: true,
        });
      }
    }, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnlyVisited]);

  const isVisited = (placeId: string) =>
    visits.some((v) => v.placeId === placeId);
  const ageFilteredPlaces = useMemo(() => {
    let result = places; // places = timeFiltered.places, već filtriran po radnom vremenu

    if (ageAllowedCats) {
      result = result.filter((p) => ageAllowedCats.includes(p.type));
    }

    // ✅ FIX: uklonjena dupla provjera — timeFiltered to već radi
    // if (activeTimeOfDay) { result = result.filter(...) }  ← OBRIŠI OVO

    return result;
  }, [places, ageAllowedCats, showOnlyVisited]);

  // PRONAĐI i ZAMIJENI placesForMap useMemo:
  // NOVO — kad je showOnlyVisited, koristi visits kao bazu:
  const placesForMap = useMemo(() => {
    if (showOnlyVisited) {
      // Prikaži posjećena mjesta kao Place objekte
      return visits.slice(0, displayLimit).map((v) => ({
        id: v.placeId,
        name: v.placeName,
        latitude: v.latitude,
        longitude: v.longitude,
        type: v.placeType as Place["type"],
        address: v.address,
      }));
    }

    let base = focusedType
      ? ageFilteredPlaces.filter((p) => p.type === focusedType)
      : ageFilteredPlaces;

    if (selectedTypes.length > 0 && !focusedType) {
      base = interleaveByType(base, selectedTypes);
    }

    return base.slice(0, displayLimit);
  }, [
    ageFilteredPlaces,
    displayLimit,
    focusedType,
    selectedTypes,
    showOnlyVisited,
    visits,
  ]);

  // Ima li još rezultata koji nisu prikazani
  // Ukupno relevantnih mjesta (nakon age/time filtera, s eventualnim focus tipom)
  const totalFiltered = focusedType
    ? ageFilteredPlaces.filter((p) => p.type === focusedType).length
    : ageFilteredPlaces.length;

  // Ima li još rezultata koji nisu prikazani
  const hasMore = totalFiltered > placesForMap.length;

  // Je li dohvat za TRENUTNI izbor gotov, i kako je prošao. Samo tada smijemo
  // reći "nema rezultata" — dok se još učitava, to bi bila laž.
  const currentLoadKey = activeSearchLoc
    ? `${selectedTypes.join(",")}|${activeSearchLoc.latitude.toFixed(3)},${activeSearchLoc.longitude.toFixed(3)}|${radius}`
    : null;
  const loadSettled =
    !isLoadingPlaces && lastLoad !== null && lastLoad.key === currentLoadKey;
  const loadFailed = loadSettled && lastLoad!.failed;
  const nothingFound =
    loadSettled &&
    allPlaces.length === 0 &&
    !showOnlyVisited &&
    selectedTypes.length > 0;

  return (
    <View style={[s.container, { flex: 1, backgroundColor: "#1a2e1a" }]}>
      <MapView
        ref={mapRef}
        style={[s.map, StyleSheet.absoluteFillObject]}
        // ✅ FIX: bio je "region={mapRegion || initialRegion}" (kontrolirano)
        // ZAJEDNO s "onRegionChangeComplete={setMapRegion}" — svaka promjena
        // regije (i vlastita, iz animateToRegion poziva ispod) vraćala se
        // natrag kroz setMapRegion u ovaj isti "region" prop, pa je mapa
        // dobivala naredbu da se pomakne na (sitno drukčiju, zbog
        // zaokruživanja) poziciju koju je upravo sama prijavila — beskonačna
        // petlja mikro-pomaka koja izgleda kao da ekran "vibrira" dok
        // korisnik ručno ne dodirne/pomakne kartu. initialRegion je
        // nekontroliran (postavlja se samo pri mountu), a stvarno
        // programsko pomicanje ide isključivo kroz mapRef.animateToRegion.
        initialRegion={initialRegion}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        loadingEnabled
        loadingIndicatorColor={V.visited}
        zoomControlEnabled={false}
      >
        {showRadiusCircle && activeSearchLoc && (
          <Circle
            center={activeSearchLoc}
            radius={radius * 1000}
            strokeWidth={2}
            strokeColor={V.visited}
            fillColor="rgba(90,138,72,0.10)"
          />
        )}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true} // ← MORA biti true za animated markere
          >
            <UserLocationMarker />
          </Marker>
        )}
        {(() => {
          // Posjećena mjesta koja NISU u trenutnom placesForMap prikazu
          const displayedIds = new Set(placesForMap.map((p) => p.id));
          // NOVO — preskoči selectedTypes filter kad je showOnlyVisited aktivan:
          const extraVisited = visits
            .filter((v) => {
              if (displayedIds.has(v.placeId)) return false;
              // Kad je showOnlyVisited, prikaži SVA posjećena mjesta bez obzira na selectedTypes
              if (!showOnlyVisited) {
                if (
                  selectedTypes.length > 0 &&
                  !selectedTypes.includes(v.placeType)
                )
                  return false;
                if (focusedType && v.placeType !== focusedType) return false;
              }
              return true;
            })
            .map((v) => ({
              id: v.placeId,
              name: v.placeName,
              latitude: v.latitude,
              longitude: v.longitude,
              type: v.placeType as Place["type"],
              address: v.address,
              _isVisited: true as const,
            }));

          const allMarkers = [
            ...placesForMap.map((p) => ({
              ...p,
              _isVisited: visits.some((v) => v.placeId === p.id),
            })),
            ...extraVisited,
          ];

          return allMarkers.map((place, i) => (
            <PlaceMarker
              key={`marker_${place.id}`}
              place={place}
              isVisited={(place as any)._isVisited}
              onPress={() => {
                setShowRadiusCircle(false);
                setSelectedPlace(place);
                setShowPlaceDetail(true);
              }}
            />
          ));
        })()}
      </MapView>

      {/* Brza traka kategorija — samo kad ima rezultata */}
      {(allPlaces.length > 0 || selectedTypes.length > 0) && (
        <QuickCategoryBar
          allPlaces={ageFilteredPlaces}
          selectedTypes={selectedTypes}
          focusedType={focusedType}
          // ZAMIJENI QuickCategoryBar onToggle u DashboardScreen:
          onToggle={(type) => {
            const newFocused = focusedType === type ? null : type;
            setFocusedType(newFocused);
            // Ako fokusiramo kategoriju, pokaži sve njene markere
            if (newFocused) {
              const countInCat = ageFilteredPlaces.filter(
                (p) => p.type === newFocused,
              ).length;
              setDisplayLimit(Math.max(displayLimit, countInCat));
            }
          }}
          DC={DC}
          t={t}
        />
      )}

      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.citySearchRow}>
          <TextInput
            selectTextOnFocus
            style={s.cityInput}
            placeholder={t("map.searchCityPlaceholder")}
            placeholderTextColor="#999"
            value={cityQuery}
            onChangeText={setCityQuery}
            onSubmitEditing={handleCitySearch}
            returnKeyType="search"
          />
          {citySearching ? (
            <ActivityIndicator
              size="small"
              color={V.visited}
              style={{ marginRight: 8 }}
            />
          ) : (
            <TouchableOpacity
              style={s.citySearchBtn}
              onPress={handleCitySearch}
            >
              <Text
                style={{ color: "#fff", fontWeight: "700", fontSize: T.meta }}
              >
                {t("common.go")}
              </Text>
            </TouchableOpacity>
          )}
          {searchLocation && (
            <TouchableOpacity style={s.clearCityBtn} onPress={clearCitySearch}>
              <Text
                style={{
                  color: "#ff4757",
                  fontSize: T.meta,
                  fontWeight: "700",
                }}
              >
                {t("map.myLocationShort")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {searchLocation && (
          <View style={s.remoteBadge}>
            <Text
              style={{ color: "#fff", fontSize: T.meta, fontWeight: "600" }}
            >
              📍 {searchLocationName}
            </Text>
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
          }}
        >
          {/* ☰ Ostalo — LIJEVO, uz Filtri */}
          <TouchableOpacity
            style={[
              s.topBtn,
              showOstalo && {
                backgroundColor: "#2a4230",
                borderWidth: 1.5,
                borderColor: "#5a8a48",
              },
            ]}
            onPress={() => setShowOstalo((v) => !v)}
          >
            <Text style={[s.topBtnText, showOstalo && { color: "#c0e0a0" }]}>
              ☰
            </Text>
          </TouchableOpacity>

          {/* Filtri */}
          <TouchableOpacity
            style={s.topBtn}
            onPress={() => setShowFilterPanel(true)}
          >
            <Text style={s.topBtnText}>
              {t("map.categories")}
              {selectedTypes.length > 0 ? ` (${selectedTypes.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Doba dana je UVIJEK u vlastitom retku ispod gumba kategorija. Prije je
            bila u istom retku s prelamanjem: dok je natpis "Kategorije" kratak
            stala je desno od njega, a čim bi dobio broj "(5)" (ili ga izgubio
            dvostrukim dodirom na doba dana, koji poništi izbor) preskočila bi
            u novi red — pa je skakala po ekranu. */}
        <View style={{ flexDirection: "row" }}>
          {/* Doba dana — jedan izbor, pa i jedna kontrola s tri stanja.
              Tri kovanice se međusobno ne razaznaju, pa svaka nosi natpis
              (Jutro / Popodne / Večer). */}
          <View style={s.todGroup}>
            {(
              [
                {
                  id: "jutro",
                  icon: morningIcon,
                  label: t("map.morningShort"),
                  hint: t("map.todHintMorning"),
                },
                {
                  id: "poslijepodne",
                  icon: afternoonIcon,
                  label: t("map.afternoonShort"),
                  hint: t("map.todHintAfternoon"),
                },
                {
                  id: "vecer",
                  icon: eveningIcon,
                  label: t("map.eveningShort"),
                  hint: t("map.todHintEvening"),
                },
              ] as const
            ).map((tod) => {
              const active = activeTimeOfDay === tod.id;
              return (
                <TouchableOpacity
                  key={tod.id}
                  style={[s.todBtn, active && s.todBtnA]}
                  accessibilityRole="button"
                  accessibilityLabel={tod.hint}
                  onPress={() => {
                    showTodHint(tod.id, tod.hint);
                    applyTimeOfDay(tod.id);
                  }}
                >
                  <Image
                    source={tod.icon}
                    style={{ width: 22, height: 22 }}
                    resizeMode="contain"
                  />
                  <Text
                    style={[s.todLabel, active && s.todLabelA]}
                    numberOfLines={1}
                  >
                    {tod.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        {/* <TouchableOpacity
          style={[
            s.topBtn,
            showOstalo && {
              backgroundColor: "#2a4230",
              borderWidth: 1.5,
              borderColor: "#5a8a48",
            },
          ]}
          onPress={() => setShowOstalo((v) => !v)}
        >
          <Text style={[s.topBtnText, showOstalo && { color: "#c0e0a0" }]}>
            ☰
          </Text>
        </TouchableOpacity> */}
      </View>

      {todHint && (
        <View
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 132 : 108,
            left: 12,
            right: 12,
            backgroundColor: "rgba(20,40,20,0.94)",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: "#5a8a48",
            zIndex: 50,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Text
            style={{ color: "#d0f0a0", fontSize: T.meta, fontWeight: "600" }}
          >
            {todHint}
          </Text>
        </View>
      )}

      {/* ✅ OVERLAY — DODAJ OVDJE, IZMEĐU topBar i dropdown panela */}
      {showOstalo && (
        <TouchableOpacity
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9998,
          }}
          activeOpacity={1}
          onPress={() => setShowOstalo(false)}
        />
      )}

      {showOstalo && (
        <View
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 168 : 144,
            left: 12, // ← LIJEVO, ispod Ostalo gumba
            backgroundColor: "#1e3620",
            borderRadius: 16,
            paddingVertical: 8,
            paddingHorizontal: 6,
            gap: 6,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 12,
            borderWidth: 1.5,
            borderColor: "#4a7040",
            zIndex: 9999,
          }}
        >
          {[
            {
              icon: planIcon,
              label: t("map.planDay"),
              onPress: () => {
                setShowOstalo(false);
                setShowPlanMyDay(true);
              },
            },
            {
              icon: groupsIcon,
              label: t("map.groups"),
              onPress: () => {
                setShowOstalo(false);
                setShowGroups(true);
              },
            },
            {
              icon: archiveIcon,
              label: t("map.visitArchive"),
              onPress: () => {
                setShowOstalo(false);
                setShowArchive(true);
              },
            },
            {
              icon: badgesIcon,
              label: t("map.badges"),
              onPress: () => {
                setShowOstalo(false);
                setShowBadges(true);
              },
            },
            {
              icon: notificationsIcon,
              label: t("notifications.title"),
              onPress: () => {
                setShowOstalo(false);
                setShowNotifications(true);
              },
              // Značka pripada popisu obavijesti, ne ekranu s postavkama.
              badge: realNotificationCount,
            },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "#2a4230",
                borderWidth: 1,
                borderColor: "#3a5a30",
              }}
              onPress={item.onPress}
              activeOpacity={0.75}
            >
              <View style={{ position: "relative" }}>
                <Image
                  source={item.icon}
                  style={{ width: 30, height: 30 }}
                  resizeMode="contain"
                />
                {item.badge != null && item.badge > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: "#cc3830",
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1.5,
                      borderColor: "#1e3620",
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{
                  color: "#d0e8c0",
                  fontSize: T.meta,
                  fontWeight: "600",
                  minWidth: 80,
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Kontrole karte (desno). Tamna "Vara" ploča s ikonama iz istog seta kao
          ostatak aplikacije; bijela podloga je maknuta jer se isticala na karti. */}
      <TouchableOpacity
        style={UI_STYLES.mapCtrlToggle}
        onPress={() => setShowMapCtrlPanel((v) => !v)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={
          showMapCtrlPanel ? t("map.hideControls") : t("map.showControls")
        }
      >
        <Text style={UI_STYLES.mapCtrlToggleChevron}>
          {showMapCtrlPanel ? "›" : "‹"}
        </Text>
        <Text style={UI_STYLES.mapCtrlLabel} numberOfLines={1}>
          {showMapCtrlPanel ? t("map.hideControls") : t("map.showControls")}
        </Text>
      </TouchableOpacity>

      {showMapCtrlPanel && (
        <View
          style={[
            UI_STYLES.mapCtrlPanel,
            { top: Platform.OS === "ios" ? 258 : 234 },
          ]}
        >
          {/* Zumiranje je prstima, pa ostaju tri stvari koje prst ne može:
              skok na moju lokaciju, radijus i prikaz posjećenog; uz njih
              pregled aktivnosti u području koje gledaš. */}
          <MapCtrlButton
            icon={APP_ICONS.mapLocate}
            label={t("map.locationBtn")}
            onPress={getCurrentLocation}
          />
          <MapCtrlButton
            icon={APP_ICONS.radius}
            label={`${radius} km`}
            active={showRadiusCircle}
            onPress={() => {
              // Prvi dodir pokaže krug i ponudi izbor radijusa; sljedeći
              // dodir zatvara izbor.
              setShowRadiusCircle(true);
              setShowRadiusPicker((v) => !v);
            }}
          />
          {/* Gleda se centar karte, pa radi i nakon pretrage i nakon
              običnog pomicanja na drugi kraj. */}
          <MapCtrlButton
            icon={APP_ICONS.mapActivities}
            label={t("map.activitiesBtn")}
            onPress={() => {
              const center = mapRegion ?? initialRegion;
              if (!center) return;
              setAreaSheetPoint({
                // Prazno ime znači "odredi ga sam" — prikaz obrnutim
                // geokodiranjem dozna kako se mjesto zove.
                name: searchQuery.trim(),
                latitude: center.latitude,
                longitude: center.longitude,
              });
            }}
          />
          <View style={UI_STYLES.mapCtrlDivider} />
          <MapCtrlButton
            icon={APP_ICONS.visited}
            label={t("map.visitedBtn")}
            active={showOnlyVisited}
            onPress={() => {
              if (!showOnlyVisited && visits.length === 0) {
                Alert.alert(t("map.visitedBtn"), t("map.noVisitsYet"));
                return;
              }
              setShowOnlyVisited((v) => !v);
            }}
          />
        </View>
      )}

      {/* Brzi izbor radijusa — lijevo od ploče s kontrolama */}
      {showMapCtrlPanel && showRadiusPicker && (
        <View
          style={[
            UI_STYLES.radiusPicker,
            { top: Platform.OS === "ios" ? 262 : 238 },
          ]}
        >
          <Text style={UI_STYLES.radiusPickerTitle}>{t("map.radius")}</Text>
          {RADIUS_CHOICES.map((km) => {
            const on = km === radius;
            return (
              <TouchableOpacity
                key={km}
                style={[UI_STYLES.radiusChip, on && UI_STYLES.radiusChipOn]}
                onPress={() => {
                  chooseRadius(km);
                  setShowRadiusPicker(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text
                  style={[
                    UI_STYLES.radiusChipTxt,
                    on && UI_STYLES.radiusChipTxtOn,
                  ]}
                >
                  {km} km
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={UI_STYLES.radiusHide}
            onPress={() => {
              setShowRadiusCircle(false);
              setShowRadiusPicker(false);
            }}
          >
            <Text style={UI_STYLES.radiusHideTxt}>{t("map.hideCircle")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Panel Modal - Vara stil */}
      <Modal
        visible={showFilterPanel}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowFilterPanel(false)}
      >
        <View style={{ flex: 1, backgroundColor: DC.bg }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 20,
              paddingTop: Platform.OS === "ios" ? 54 : 36,
              borderBottomWidth: 1.5,
              borderBottomColor: DC.border,
              backgroundColor: DC.bg,
            }}
          >
            <Text
              style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
            >
              {t("map.filters")}
            </Text>
            <TouchableOpacity onPress={() => setShowFilterPanel(false)}>
              <Text
                style={{
                  fontSize: T.body,
                  color: DC.textDim,
                  fontWeight: "600",
                }}
              >
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Kratko objašnjenje — što ploča radi i kada se karta osvježi */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginHorizontal: 16,
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                backgroundColor: DC.card,
                borderWidth: 1,
                borderColor: DC.borderDim,
              }}
            >
              <Image
                source={APP_ICONS.navSearch}
                style={{ width: 34, height: 34 }}
                resizeMode="contain"
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: T.meta,
                  color: DC.textSub,
                  lineHeight: 18,
                }}
              >
                {t("map.filtersHint")}
              </Text>
            </View>

            {/* 1. Radijus — jedan red, svi jednako široki */}
            <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <Image
                  source={APP_ICONS.radius}
                  style={{ width: 28, height: 28 }}
                  resizeMode="contain"
                />
                <Text
                  style={{
                    fontSize: T.body,
                    fontWeight: "700",
                    color: DC.textSub,
                  }}
                >
                  {t("map.radius")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {RADIUS_CHOICES.map((r) => {
                  const active = radius === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={{
                        flex: 1,
                        paddingVertical: 11,
                        alignItems: "center",
                        backgroundColor: active ? DC.cardHover : DC.card,
                        borderRadius: 10,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? DC.border : DC.borderDim,
                      }}
                      onPress={() => chooseRadius(r)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={{
                          fontSize: T.meta,
                          color: active ? DC.text : DC.textDim,
                          fontWeight: active ? "800" : "500",
                        }}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text
                style={{ fontSize: T.caption, color: DC.textDim, marginTop: 6 }}
              >
                {t("map.radiusUnit", { km: radius })}
              </Text>
            </View>

            {/* 2. Doba dana — tri jednaka polja u redu */}
            <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 10,
                }}
              >
                {t("map.timeOfDay")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  {
                    key: "jutro",
                    icon: morningIcon,
                    label: t("map.morning"),
                    sub: t("map.morningDesc"),
                  },
                  {
                    key: "poslijepodne",
                    icon: afternoonIcon,
                    label: t("map.afternoon"),
                    sub: t("map.afternoonDesc"),
                  },
                  {
                    key: "vecer",
                    icon: eveningIcon,
                    label: t("map.evening"),
                    sub: t("map.eveningDesc"),
                  },
                ].map((tod) => {
                  const active = activeTimeOfDay === tod.key;
                  return (
                    <TouchableOpacity
                      key={tod.key}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 10,
                        paddingHorizontal: 4,
                        borderRadius: 12,
                        backgroundColor: active ? DC.cardHover : DC.card,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? DC.border : DC.borderDim,
                      }}
                      onPress={() => applyTimeOfDay(tod.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Image
                        source={tod.icon}
                        style={{ width: 52, height: 52 }}
                        resizeMode="contain"
                      />
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: "700",
                          color: DC.text,
                          marginTop: 4,
                        }}
                        numberOfLines={1}
                      >
                        {tod.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: T.caption,
                          color: DC.textDim,
                          marginTop: 2,
                          textAlign: "center",
                        }}
                        numberOfLines={2}
                      >
                        {tod.sub}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 3. Kategorije — pretraga + gusta mreža 4 u redu (bez dugog listanja) */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 18,
                paddingBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: T.body,
                    fontWeight: "700",
                    color: DC.textSub,
                  }}
                >
                  {t("map.categories")}
                  {selectedTypes.length > 0 ? ` · ${selectedTypes.length}` : ""}
                </Text>
                {selectedTypes.length > 0 && (
                  <TouchableOpacity
                    hitSlop={TAP_SLOP}
                    onPress={() => {
                      setSelectedTypes([]);
                      setActiveTimeOfDay(null);
                    }}
                  >
                    <Text
                      style={{
                        fontSize: T.meta,
                        color: DC.accent,
                        fontWeight: "600",
                      }}
                    >
                      {t("map.clearAll")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                selectTextOnFocus
                value={categoryQuery}
                onChangeText={setCategoryQuery}
                placeholder={t("map.searchCategories")}
                placeholderTextColor={DC.textDim}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: T.body,
                  color: DC.text,
                  marginBottom: 10,
                }}
              />
              {visibleCategories.length === 0 ? (
                <Text
                  style={{
                    color: DC.textDim,
                    fontSize: T.meta,
                    paddingVertical: 12,
                  }}
                >
                  {t("map.noCategoryMatch")}
                </Text>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: CAT_GAP,
                  }}
                >
                  {visibleCategories.map((cat) => {
                    const active = selectedTypes.includes(cat.id);
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={{
                          width: CAT_CELL_W,
                          minHeight: 96,
                          backgroundColor: active ? cat.color : DC.card,
                          borderRadius: 12,
                          justifyContent: "center",
                          alignItems: "center",
                          paddingHorizontal: 2,
                          paddingVertical: 6,
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? cat.color : DC.borderDim,
                        }}
                        onPress={() => toggleType(cat.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <CategoryCoin
                          id={cat.id}
                          fallbackGlyph={cat.icon}
                          size={56}
                          style={{ marginBottom: 3 }}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: active ? "#fff" : DC.textSub,
                            textAlign: "center",
                          }}
                          numberOfLines={2}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Dobne grupe */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: T.body,
                    fontWeight: "700",
                    color: DC.textSub,
                  }}
                >
                  {t("map.forAgeGroup")}
                </Text>
                {selectedAgeGroups.length > 0 && (
                  <TouchableOpacity onPress={() => setSelectedAgeGroups([])}>
                    <Text
                      style={{
                        fontSize: T.meta,
                        color: DC.accent,
                        fontWeight: "600",
                      }}
                    >
                      {t("map.clearAgeFilter")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {getAgeGroups().map((grp) => {
                  const active = selectedAgeGroups.includes(grp.id);
                  return (
                    <TouchableOpacity
                      key={grp.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: active ? grp.color : DC.card,
                        borderWidth: 1.5,
                        borderColor: active ? grp.color : DC.borderDim,
                      }}
                      onPress={() => {
                        const newGroups = selectedAgeGroups.includes(grp.id)
                          ? selectedAgeGroups.filter((x) => x !== grp.id)
                          : [...selectedAgeGroups, grp.id];

                        setSelectedAgeGroups(newGroups);
                        setActiveTimeOfDay(null); // resetiraj TOD filter — dobna grupa ima prednost

                        if (newGroups.length > 0) {
                          // Skupi sve kategorije iz svih odabranih dobnih skupina (bez duplikata)
                          const ageCats = [
                            ...new Set(
                              newGroups.flatMap(
                                (gId) =>
                                  getAgeGroups().find((g) => g.id === gId)
                                    ?.cats ?? [],
                              ),
                            ),
                          ];
                          setSelectedTypes(ageCats);
                        } else {
                          // Ako su sve dobne grupe odznačene, očisti i kategorije
                          setSelectedTypes([]);
                        }
                      }}
                    >
                      <Image
                        source={grp.icon}
                        style={{ width: 60, height: 60 }}
                        resizeMode="contain"
                      />
                      <View>
                        <Text
                          style={{
                            fontSize: T.meta,
                            fontWeight: "700",
                            color: active ? "#fff" : DC.text,
                          }}
                        >
                          {grp.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: active
                              ? "rgba(255,255,255,0.75)"
                              : DC.textDim,
                          }}
                        >
                          {grp.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedAgeGroups.length > 0 && (
                <View
                  style={{
                    marginTop: 10,
                    backgroundColor: DC.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DC.border,
                    padding: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.accent,
                      fontWeight: "600",
                    }}
                  >
                    {selectedAgeGroups
                      .map(
                        (id) => getAgeGroups().find((g) => g.id === id)?.label,
                      )
                      .join(", ")}
                  </Text>
                </View>
              )}
            </View>

            {/* Limit prikaza */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: DC.borderDim,
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.textSub,
                  marginBottom: 4,
                }}
              >
                {" "}
                {t("map.displayOnMap", {
                  shown: Math.min(displayLimit, allPlaces.length),
                  total: allPlaces.length,
                })}
              </Text>
              <Text
                style={{
                  fontSize: T.meta,
                  color: DC.textDim,
                  marginBottom: 12,
                }}
              >
                {t("map.displayLimitHint")}
              </Text>
              {allPlaces.length > 0 && (
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {[10, 20, 50, 100]
                    .filter((n) => n <= allPlaces.length || n === 10)
                    .map((n) => {
                      const active = displayLimit === n;
                      return (
                        <TouchableOpacity
                          key={n}
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 9,
                            backgroundColor: active ? DC.cardHover : DC.card,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: active ? DC.border : DC.borderDim,
                          }}
                          onPress={() => setDisplayLimit(n)}
                        >
                          <Text
                            style={{
                              fontSize: T.meta,
                              color: active ? DC.text : DC.textDim,
                              fontWeight: active ? "700" : "400",
                            }}
                          >
                            {n}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      backgroundColor:
                        displayLimit >= allPlaces.length
                          ? "#3a5a30"
                          : "#2a4230",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor:
                        displayLimit >= allPlaces.length
                          ? "#5a8a48"
                          : "#3a5a30",
                    }}
                    onPress={() => setDisplayLimit(allPlaces.length)}
                  >
                    <Text
                      style={{
                        fontSize: T.meta,
                        color:
                          displayLimit >= allPlaces.length
                            ? "#e8e8e8"
                            : "#b0b0b0",
                      }}
                    >
                      {t("common.all")} ({allPlaces.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Skrivena mjesta */}
            {hiddenPlaceIds.length > 0 && (
              <View style={{ padding: 16 }}>
                <Text
                  style={{
                    fontSize: T.body,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 8,
                  }}
                >
                  {t("map.hiddenPlaces", { count: hiddenPlaceIds.length })}
                </Text>
                {hiddenPlaceIds.map((id) => (
                  <TouchableOpacity
                    key={id}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: DC.card,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: DC.borderDim,
                      padding: 12,
                      marginBottom: 8,
                    }}
                    onPress={() => handleRestorePlace(id)}
                  >
                    <Text
                      style={{ fontSize: T.meta, color: DC.textDim, flex: 1 }}
                      numberOfLines={1}
                    >
                      ID: {id.split("_").slice(-1)[0]}
                    </Text>
                    <Text style={{ color: DC.accent, fontWeight: "700" }}>
                      ↩ {t("map.restorePlace")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Apply gumb — uvijek vidljiv, ne treba listati do dna */}
          <View
            style={{
              padding: 12,
              paddingBottom: Platform.OS === "ios" ? 28 : 14,
              borderTopWidth: 1.5,
              borderTopColor: DC.border,
              backgroundColor: DC.bg,
            }}
          >
            <TouchableOpacity
              style={{
                backgroundColor: DC.cardHover,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: DC.border,
                paddingVertical: 15,
                alignItems: "center",
              }}
              onPress={() => setShowFilterPanel(false)}
            >
              <Text
                style={{ color: DC.text, fontSize: T.lead, fontWeight: "700" }}
              >
                {selectedTypes.length > 0
                  ? t("map.applyWithCount", { count: selectedTypes.length })
                  : t("map.apply")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modali */}
      <PlaceDetailModal
        place={selectedPlace}
        visible={showPlaceDetail}
        onClose={() => {
          setShowPlaceDetail(false);
        }}
        onMarkVisited={handleMarkVisited}
        onHidePlace={handleHidePlace}
        isVisited={selectedPlace ? isVisited(selectedPlace.id) : false}
        notifPrefs={notifPrefs}
        onToggleNotif={handleToggleNotif}
      />
      <VisitArchiveModal
        visible={showArchive}
        onClose={() => setShowArchive(false)}
        visits={visits}
        onSelectVisit={(v) => {
          setShowArchive(false);
          // Uključi showOnlyVisited da se posjećena mjesta renderiraju na karti.
          // Kamera ide na odabrano mjesto (ispod), ne na sva posjećena.
          skipVisitedFitRef.current = true;
          setShowOnlyVisited(true);
          setTimeout(() => {
            mapRef.current?.animateToRegion(
              {
                latitude: v.latitude,
                longitude: v.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              600,
            );
            // Otvori detail modal za to mjesto
            setSelectedPlace({
              id: v.placeId,
              name: v.placeName,
              latitude: v.latitude,
              longitude: v.longitude,
              type: v.placeType as Place["type"],
              address: v.address,
            });
            setShowPlaceDetail(true);
          }, 400);
        }}
        onDeleteVisit={handleDeleteVisit}
        onDeleteVisits={handleDeleteVisits}
      />
      <BadgesModal
        visible={showBadges}
        onClose={() => setShowBadges(false)}
        visits={visits}
        getAllCategories={getAllCategories}
      />
      <PlanMyDayModal
        visible={showPlanMyDay}
        userLocation={userLocation}
        onClose={() => setShowPlanMyDay(false)}
        onMarkVisited={handleMarkVisited}
        visits={visits}
        PlaceDetailModalComponent={PlaceDetailModal}
      />
      {/* Objave oko mjesta na koje je karta namještena. */}
      <AreaActivitiesSheet
        visible={areaSheetPoint !== null}
        point={areaSheetPoint}
        onClose={() => setAreaSheetPoint(null)}
      />

      <NotificationsModal
        onOpenSettings={() => {
          setShowNotifications(false);
          setShowNotifSettings(true);
        }}
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        onUnreadChange={setRealNotificationCount}
      />
      <NotificationSettingsModal
        visible={showNotifSettings}
        prefs={notifPrefs}
        onClose={() => setShowNotifSettings(false)}
        onSave={(p) => {
          persistNotifPrefs(p);
        }}
        getAllCategories={getAllCategories}
      />
      <ActivityGroupsModal
        visible={showGroups}
        onClose={() => setShowGroups(false)}
        userLocation={userLocation}
      />
      {/* Info bar — broj rezultata, a kad ih nema, ZAŠTO ih nema. */}
      {(isLoadingPlaces ||
        places.length > 0 ||
        activeTimeOfDay ||
        showOnlyVisited ||
        loadFailed ||
        nothingFound) && (
        <View style={UI_STYLES.infoBar}>
          {isLoadingPlaces ? (
            <>
              <ActivityIndicator size="small" color="#a0d080" />
              <Text style={UI_STYLES.infoBarText}>
                {t("map.loading")}
                {loadSeconds >= 4 ? ` ${loadSeconds} s` : ""}
              </Text>
            </>
          ) : (
            (() => {
              if (showOnlyVisited) {
                return (
                  <Text style={UI_STYLES.infoBarText}>
                    {t("map.visitedPlacesCount", { count: visits.length })}
                  </Text>
                );
              }

              const shown = placesForMap.length;
              const total = totalFiltered;

              const retryBtn = (
                <TouchableOpacity
                  style={UI_STYLES.infoShowMoreBtn}
                  onPress={() => loadPlacesInRadius()}
                >
                  <Text style={UI_STYLES.infoShowMoreText}>
                    ↻ {t("map.retry")}
                  </Text>
                </TouchableOpacity>
              );

              if (total === 0) {
                // Sve što je pronađeno isključeno je zapisanim radnim vremenom.
                if (activeTimeOfDay && allPlaces.length > 0) {
                  return (
                    <>
                      <Text style={UI_STYLES.infoBarText}>
                        {t("map.noneOpenInWindow")}
                      </Text>
                      <TouchableOpacity
                        style={UI_STYLES.infoShowMoreBtn}
                        onPress={() => setActiveTimeOfDay(null)}
                      >
                        <Text style={UI_STYLES.infoShowMoreText}>
                          {t("map.showAllPlaces", { count: allPlaces.length })}
                        </Text>
                      </TouchableOpacity>
                    </>
                  );
                }
                if (loadFailed) {
                  return (
                    <>
                      <Text style={UI_STYLES.infoBarText}>
                        {t("map.loadFailed")}
                      </Text>
                      {retryBtn}
                    </>
                  );
                }
                return (
                  <Text style={UI_STYLES.infoBarText}>
                    {t("map.noResultsInRadius", { radius })}
                  </Text>
                );
              }

              const activeCatCount = selectedTypes.filter((type) =>
                ageFilteredPlaces.some((p) => p.type === type),
              ).length;

              const catLabel = focusedType
                ? t(`categories.${focusedType}`, { defaultValue: focusedType })
                : activeCatCount > 1
                  ? t("map.categoriesCount", { count: activeCatCount })
                  : selectedTypes.length === 1
                    ? t(`categories.${selectedTypes[0]}`, {
                        defaultValue: selectedTypes[0],
                      })
                    : t("map.results");

              const unconfirmedCount = activeTimeOfDay
                ? ageFilteredPlaces.filter((p) =>
                    timeFiltered.unconfirmed.has(p.id),
                  ).length
                : 0;

              return (
                <>
                  <View style={{ flex: 1 }}>
                    <Text style={UI_STYLES.infoBarText}>
                      {t("map.shownOfTotal", { shown, total, label: catLabel })}
                    </Text>
                    {unconfirmedCount > 0 && (
                      <Text
                        style={[
                          UI_STYLES.infoBarText,
                          {
                            fontSize: T.caption,
                            opacity: 0.75,
                            fontWeight: "400",
                          },
                        ]}
                      >
                        {t("map.unconfirmedHours", { count: unconfirmedCount })}
                      </Text>
                    )}
                    {loadFailed && (
                      <Text
                        style={[
                          UI_STYLES.infoBarText,
                          {
                            fontSize: T.caption,
                            opacity: 0.75,
                            fontWeight: "400",
                          },
                        ]}
                      >
                        {t("map.loadPartial")}
                      </Text>
                    )}
                  </View>
                  {isLoadingMore && (
                    <ActivityIndicator size="small" color="#a0d080" />
                  )}
                  {loadFailed && retryBtn}
                  {hasMore && (
                    <TouchableOpacity
                      style={UI_STYLES.infoShowMoreBtn}
                      onPress={() =>
                        setDisplayLimit((prev) => prev + RESULTS_STEP)
                      }
                    >
                      <Text style={UI_STYLES.infoShowMoreText}>
                        +
                        {Math.min(
                          totalFiltered - placesForMap.length,
                          RESULTS_STEP,
                        )}{" "}
                        {t("common.more")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()
          )}
        </View>
      )}
    </View>
  );
}

// const s = StyleSheet.create({
//   container: { flex: 1 },
//   map: { flex: 1 },
//   topBar: {
//     position: "absolute",
//     top: Platform.OS === "ios" ? 54 : 36,
//     left: 12,
//     right: 12,
//     gap: 8,
//   },
//   citySearchRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: "#fff",
//     borderRadius: 24,
//     paddingLeft: 14,
//     paddingRight: 6,
//     paddingVertical: 4,
//     gap: 6,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.2,
//     shadowRadius: 4,
//     elevation: 5,
//   },
//   cityInput: { flex: 1, fontSize: T.body, color: "#333", paddingVertical: 8 },
//   citySearchBtn: {
//     backgroundColor: "#667eea",
//     borderRadius: 18,
//     paddingHorizontal: 14,
//     paddingVertical: 7,
//   },
//   clearCityBtn: {
//     backgroundColor: "#fff0f0",
//     borderRadius: 16,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//   },
//   remoteBadge: {
//     backgroundColor: "#667eea",
//     borderRadius: 18,
//     paddingHorizontal: 14,
//     paddingVertical: 6,
//     alignSelf: "flex-start",
//   },
//   topBtn: {
//     backgroundColor: "#fff",
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     borderRadius: 24,
//     alignSelf: "flex-start",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.2,
//     shadowRadius: 4,
//     elevation: 4,
//   },
//   topBtnText: { fontSize: T.body, fontWeight: "600", color: "#333" },
//   todBtn: {
//     backgroundColor: "rgba(255,255,255,0.92)",
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     justifyContent: "center",
//     alignItems: "center",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.15,
//     shadowRadius: 3,
//     elevation: 3,
//   },
//   todBtnA: { backgroundColor: "#667eea" },
//   todTxt: { fontSize: T.title },
//   sidePanel: { position: "absolute", right: 12, bottom: 110, gap: 8 },
//   sideBtn: {
//     backgroundColor: "#fff",
//     width: 46,
//     height: 46,
//     borderRadius: 23,
//     justifyContent: "center",
//     alignItems: "center",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.2,
//     shadowRadius: 4,
//     elevation: 5,
//   },
//   sideBtnA: { backgroundColor: "#667eea" },
//   sideBtnNotif: { backgroundColor: "#fff3cd" },
//   sideBtnTxt: { fontSize: T.title },
//   notifDot: {
//     position: "absolute",
//     top: 0,
//     right: 0,
//     width: 16,
//     height: 16,
//     borderRadius: 8,
//     backgroundColor: "#ff3b30",
//     justifyContent: "center",
//     alignItems: "center",
//     borderWidth: 1.5,
//     borderColor: "#fff",
//   },
//   loadingBar: {
//     position: "absolute",
//     bottom: 90,
//     left: 20,
//     right: 20,
//     flexDirection: "row",
//     backgroundColor: "rgba(102,126,234,0.9)",
//     borderRadius: 24,
//     paddingVertical: 10,
//     paddingHorizontal: 20,
//     alignItems: "center",
//     gap: 10,
//     justifyContent: "center",
//   },
//   loadingTxt: { color: "#fff", fontSize: T.body, fontWeight: "600" },
//   // Bottom bar: count + "Prikaži više" gumb
//   bottomBar: {
//     position: "absolute",
//     bottom: 90,
//     left: 20,
//     right: 20,
//     backgroundColor: "rgba(0,0,0,0.75)",
//     borderRadius: 24,
//     paddingVertical: 8,
//     paddingHorizontal: 16,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   countTxt: { color: "#fff", fontSize: T.meta, fontWeight: "600", flex: 1 },
//   showMoreBtn: {
//     backgroundColor: "#667eea",
//     borderRadius: 16,
//     paddingHorizontal: 12,
//     paddingVertical: 6,
//     marginLeft: 8,
//   },
//   showMoreTxt: { color: "#fff", fontSize: T.meta, fontWeight: "700" },
// })
