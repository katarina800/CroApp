/**
 * PlanMyDayModal.tsx — v9 COMPLETE FIX
 *
 * POPRAVCI:
 * 1. [SINKRONIZACIJA KARTA↔OPIS] Karta i opis koriste IDENTIČAN niz venue-ova
 * 2. [IKONE] Slike se prikazuju ispravno - fallback na emoji ako slika ne postoji
 * 3. [DUGME OTVORI] Prikazuje se za SVAKU aktivnost koja ima venue
 * 4. [RADNO VRIJEME] Hardkodirani raspored koji poštuje radno vrijeme
 * 5. [BROJEVI] Svaka aktivnost ima jedinstven broj (1-8)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { AreaActivitiesSheet } from "./AreaActivitiesSheet";
import { API_BASE_URL } from "../app/config/api"; // prilagodi putanju

import {
  geocodeCity,
  deduplicatePlaces,
  getPlacesInRadiusDetailed,
  Place,
  placeCategories,
} from "../app/services/locationService";
import { T, pb } from "../styles/varaTheme";
// Ikone (nove; stare viking kovanice su u LEGACY_ICONS, prekidač USE_LEGACY_ICONS).
import { APP_ICONS } from "../constants/icons";
import { useTheme } from "./AdaptiveThemeProvider";
import { fetchGoogleNearby } from "@/app/services/googleNearby";
import { getToken } from "@/utils/tokenStore";
import {
  estimateMinutes,
  getTimeBasedActivities,
  haversineKm,
  modeFromTransport,
  planStartFor,
  suggestMode,
  type CompanionType,
  type DayActivity,
  type PlanStyle,
  type TransportType,
  type TravelMode,
  type VenueItem,
} from "@/utils/planEngine";

// ---------------------------------------------------------------------------
// Tipovi
// ---------------------------------------------------------------------------
type PlanStep = "form" | "loading" | "result";
interface VenueWithType {
  venue: VenueItem;
  type: string;
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

interface PlaceDetailModalProps {
  place: Place | null;
  visible: boolean;
  onClose: () => void;
  onMarkVisited: (p: Place) => void;
  onHidePlace: (id: string) => void;
  isVisited: boolean;
  notifPrefs: {
    appEnabled: boolean;
    emailEnabled: boolean;
    email: string;
    categories: string[];
  };
  onToggleNotif: (catId: string) => void;
}

export interface PlanMyDayModalProps {
  visible: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onMarkVisited?: (place: Place) => Promise<void>;
  visits?: VisitRecord[];
  PlaceDetailModalComponent: React.ComponentType<PlaceDetailModalProps>;
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------

function getDC(isDark: boolean) {
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
  } as const;
}

// ---------------------------------------------------------------------------
// Konstante
// ---------------------------------------------------------------------------
const ROUTE_COLORS = [
  "#d63031",
  "#00b894",
  "#0984e3",
  "#e17055",
  "#6c5ce7",
  "#00cec9",
  "#fd79a8",
];

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
};

// Marker slike

const MARKER_IMAGES: Record<string, any> = {
  restaurant: APP_ICONS.restaurant,
  cafe: APP_ICONS.cafe,
  club: APP_ICONS.club,
  beach: APP_ICONS.beach,
  landmark: APP_ICONS.landmark,
  opg: APP_ICONS.opg,
  accommodation: APP_ICONS.accommodation,
  market: APP_ICONS.market,
  paintball: APP_ICONS.paintball,
  cinema: APP_ICONS.cinema,
  park: APP_ICONS.park,
  escapeRoom: APP_ICONS.escapeRoom,
  museum: APP_ICONS.museum,
  theater: APP_ICONS.theater,
  mountain: APP_ICONS.mountain,
  nationalPark: APP_ICONS.nationalPark,
  cave: APP_ICONS.cave,
  spa: APP_ICONS.spa,
  other: APP_ICONS.other,
};

// ---------------------------------------------------------------------------
// Helper funkcije
// ---------------------------------------------------------------------------
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function venueNamesMatch(a: string, b: string): boolean {
  const n1 = normalize(a);
  const n2 = normalize(b);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

function findVenueByName(
  name: string,
  allVenues: Record<string, VenueItem[]>,
  typeHint?: string | null,
): { venue: VenueItem; type: string } | null {
  if (!name) return null;
  const normalized = normalize(name);

  for (const [type, list] of Object.entries(allVenues)) {
    for (const v of list) {
      if (venueNamesMatch(v.name, name)) {
        return { venue: v, type };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// fetchVenuesNearCity
// ---------------------------------------------------------------------------
interface DestinationSuggestion {
  displayName: string;
  lat: string;
  lon: string;
}

/**
 * Prijedlozi odredišta. Poslužitelj aplikacije je na besplatnom hostingu koji
 * "zaspi" pa se budi pola minute — dotle polje za odredište vrti i plan se ne
 * može pokrenuti (traži potvrđeno mjesto). Zato poslužitelj dobiva nekoliko
 * sekundi, a potom se isti upit pita izravno OpenStreetMap geokoder.
 */
async function fetchDestinationSuggestions(
  query: string,
  token: string | null,
): Promise<DestinationSuggestion[]> {
  const q = query.trim();
  const timed = async (
    url: string,
    init: RequestInit | undefined,
    ms: number,
  ) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(id);
    }
  };

  try {
    const res = await timed(
      `${API_BASE_URL}/api/locationsearch/autocomplete?query=${encodeURIComponent(q)}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      3500,
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // poslužitelj spava ili je nedostupan — pada se na izravno geokodiranje
  }

  try {
    const res = await timed(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "CroMapApp/1.0" } },
      6000,
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((d: any) => d.lat && d.lon && d.display_name)
      .map((d: any) => ({
        displayName: String(d.display_name)
          .split(",")
          .slice(0, 3)
          .join(",")
          .trim(),
        lat: String(d.lat),
        lon: String(d.lon),
      }));
  } catch {
    return [];
  }
}

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
/**
 * Kad je Google već odgovorio, OpenStreetMap ima još toliko vremena da dopuni
 * ono što Google nema (plaže, tržnice, kazališta…). Javni OSM poslužitelji su
 * često preopterećeni; bez ovoga bi plan čekao njih i kad je Google odavno gotov.
 */
const OSM_GRACE_MS = 2500;
/** Najdulje što korisnik čeka na plan; dulje od toga je bolja jasna greška i ponovni pokušaj. */
const PLAN_FETCH_BUDGET_MS = 30000;

async function fetchVenuesNearCity(
  cityQuery: string,
  radiusKm: number,
  interests: string[],
  // Koordinate odabrane iz popisa prijedloga. Kad ih imamo, ne geokodira se
  // ponovno: to je bio dodatni mrežni krug (i mjesto gdje je plan znao
  // zakazati jer je upit "Zagreb, Hrvatska Hrvatska" Nominatimu nejasan).
  known: { latitude: number; longitude: number; displayName: string } | null,
): Promise<{
  geocoded: { latitude: number; longitude: number; displayName: string } | null;
  venues: Record<string, VenueItem[]>;
}> {
  const geocoded = known ?? (await geocodeCity(cityQuery));
  if (!geocoded) return { geocoded: null, venues: {} };
  // Predmemorija se NE briše: dijeli je glavna karta, a ključ već sadrži
  // koordinate, radijus i kategorije, pa stari zapisi ne smetaju. Brisanje je
  // pri svakom planu bacalo i sve što je karta već učitala.

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
  // Oba izvora se pitaju ISTODOBNO. Google odgovara za ~1 s; OpenStreetMap
  // zna trajati i puno dulje ili ne odgovoriti.
  const osmPromise = getPlacesInRadiusDetailed(
    geocoded.latitude,
    geocoded.longitude,
    radiusKm,
    cats as any,
  ).catch(() => ({ places: [] as Place[], failed: true }));

  const googlePlaces = GOOGLE_KEY
    ? await fetchGoogleNearby(
        GOOGLE_KEY,
        geocoded.latitude,
        geocoded.longitude,
        radiusKm * 1000,
        cats,
        true, // plan ne treba radno vrijeme — jeftiniji upit
      ).catch(() => [] as Place[])
    : [];

  // Imamo li Googleove rezultate, OSM čeka samo kratko; inače ga čekamo do kraja.
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const osm = await Promise.race([
    osmPromise,
    new Promise<null>((resolve) => {
      graceTimer = setTimeout(
        () => resolve(null),
        googlePlaces.length > 0 ? OSM_GRACE_MS : PLAN_FETCH_BUDGET_MS - 5000,
      );
    }),
  ]).finally(() => clearTimeout(graceTimer));

  const places = deduplicatePlaces([...googlePlaces, ...(osm?.places ?? [])]);
  places.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  // Nijedan izvor nije dao ništa, a barem jedan nije ni odgovorio: to nije
  // "grad bez mjesta", pa se korisniku kaže da pokuša ponovno umjesto da
  // dobije prazan plan.
  if (places.length === 0 && (!osm || osm.failed)) {
    throw new Error("places-unavailable");
  }
  if (__DEV__) {
    console.log(
      `[plan] sources: Google ${googlePlaces.length}, OSM ${osm ? osm.places.length + (osm.failed ? " (failed)" : "") : "not in time"}`,
    );
  }

  const venues: Record<string, VenueItem[]> = {};
  for (const p of places) {
    if (!venues[p.type]) venues[p.type] = [];
    if (venues[p.type].length < 8) {
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

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
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

const InterestiGrid = React.memo(function InterestiGrid({
  interests,
  onToggle,
  DC,
  t,
}: {
  interests: string[];
  onToggle: (id: string) => void;
  DC: ReturnType<typeof getDC>;
  t: (key: string, opts?: any) => string;
}) {
  const keys = Object.keys(EMOJIS);
  // useWindowDimensions umjesto Dimensions.get() na razini modula: ono se
  // očita jednom pri učitavanju i nikad se ne osvježi, pa je u podijeljenom
  // zaslonu ili na preklopnom uređaju širina kartica ostajala kriva.
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 32 - 4) / 2 - 2;

  return (
    <View style={{ gap: 4 }}>
      {Array.from({ length: Math.ceil(keys.length / 2) }, (_, i) => {
        const pair = keys.slice(i * 2, i * 2 + 2);
        return (
          <View
            key={`row_${i}`}
            style={{ flexDirection: "row", gap: 4, marginHorizontal: -14 }}
          >
            {pair.map((id) => {
              const active = interests.includes(id);
              return (
                <TouchableOpacity
                  key={id}
                  style={{
                    width: cardW,
                    height: 130,
                    borderRadius: 12,
                    backgroundColor: active ? DC.border : DC.card,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? DC.border : DC.borderDim,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingHorizontal: 4,
                    paddingVertical: 8,
                  }}
                  onPress={() => onToggle(id)}
                >
                  {MARKER_IMAGES[id] ? (
                    <Image
                      source={MARKER_IMAGES[id]}
                      style={{ width: 96, height: 96, marginBottom: 4 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={{ fontSize: 56, marginBottom: 4 }}>
                      {EMOJIS[id]}
                    </Text>
                  )}
                  <Text
                    style={{
                      fontSize: T.caption,
                      fontWeight: active ? "700" : "600",
                      color: active ? "#fff" : DC.textSub,
                      textAlign: "center",
                    }}
                    numberOfLines={2}
                  >
                    {t(`categories.${id}`, { defaultValue: id })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Put do mjesta: procjena vremena, smjer i otvaranje navigacije
// ---------------------------------------------------------------------------
const TRAVEL_MODES: TravelMode[] = [
  "walking",
  "bicycling",
  "driving",
  "transit",
];

const TRAVEL_MODE_ICON: Record<TravelMode, string> = {
  walking: "🚶",
  bicycling: "🚲",
  driving: "🚗",
  transit: "🚌",
};

/**
 * Dalje od ovoga ne crtamo "ja → mjesto" na karti: tko planira put u drugi
 * grad dobio bi kartu na kojoj se ne vidi ništa, pa se tada samo približi
 * mjesto, a udaljenost ostaje napisana na kartici.
 */
const FAR_KM = 50;

function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

type CompassKey = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** Smjer iz točke `from` prema `to`, kao strana svijeta. */
function compassDirection(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): CompassKey {
  const rad = Math.PI / 180;
  const dLon = (to.longitude - from.longitude) * rad;
  const y = Math.sin(dLon) * Math.cos(to.latitude * rad);
  const x =
    Math.cos(from.latitude * rad) * Math.sin(to.latitude * rad) -
    Math.sin(from.latitude * rad) *
      Math.cos(to.latitude * rad) *
      Math.cos(dLon);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  const keys: CompassKey[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  return keys[Math.round(deg / 45) % 8];
}

/**
 * Otvara navigaciju do mjesta u aplikaciji karata na uređaju (polazište je
 * trenutni položaj korisnika). Aplikacija sama nema usmjeravanje po ulicama;
 * ovo je ono što korisniku zapravo treba kad stoji i pita "kako tamo?".
 */
function openDirections(
  dest: { latitude: number; longitude: number },
  mode: TravelMode,
  onError: () => void,
) {
  const lat = dest.latitude.toFixed(6);
  const lng = dest.longitude.toFixed(6);
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=${
          mode === "transit" ? "r" : mode === "driving" ? "d" : "w"
        }`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode}`;
  Linking.openURL(url).catch(onError);
}

/** Čisti prikaz karte: bez država, pokrajina i tuđih poslovnih mjesta koji zaklanjaju naše oznake. */
const PLAN_MAP_STYLE = [
  {
    featureType: "administrative.country",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.province",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  {
    featureType: "transit",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

// Okrugle ikone-gumbi na karti umjesto tekstualnih "pilula": natpisi
// ("Ti i postaja", "Sve postaje") zauzimali su četvrtinu karte i nisu bili
// jasni. Značenje ostaje u accessibilityLabel.
const mapPill = (isDark: boolean) =>
  ({
    backgroundColor: isDark ? "rgba(20,30,20,0.92)" : "rgba(255,255,255,0.95)",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  }) as const;

const mapPillText = (isDark: boolean) =>
  ({
    fontSize: T.lead,
    fontWeight: "700",
    color: isDark ? "#e8e8e8" : "#1a2a18",
  }) as const;

/**
 * Oznake na karti sa slikom iz Viewa treba crtati "do kraja" prije nego što
 * se prestane pratiti promjene (inače na Androidu ostanu prazne), a opet
 * crtati kad se promijeni stanje (odabrano, posjećeno).
 */
function useBriefTracking(deps: unknown[]): boolean {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const id = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tracking;
}

// ---------------------------------------------------------------------------
// Markeri na karti
// ---------------------------------------------------------------------------

/** Položaj korisnika: plava točka s haloom — uobičajena oznaka "ti si ovdje". */
function UserMarker({
  coordinate,
}: {
  coordinate: { latitude: number; longitude: number };
}) {
  const tracking = useBriefTracking([]);
  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={tracking}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={5}
    >
      <View
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "rgba(30,136,229,0.22)",
          }}
        />
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#1e88e5",
            borderWidth: 3,
            borderColor: "#fff",
          }}
        />
      </View>
    </Marker>
  );
}

/**
 * Postaja plana: obojani krug s REDNIM BROJEM. Boja je boja kategorije, a
 * broj govori redoslijed — to dvoje se na karti mora čitati odmah, bez
 * slika koje pri maloj veličini nitko ne razabire. Odabrana postaja je veća
 * i ima prsten.
 */
function SimpleMarker({
  activity,
  color,
  isActive,
  isCompleted,
  onPress,
}: {
  activity: DayActivity;
  color: string;
  isActive: boolean;
  isCompleted: boolean;
  onPress: () => void;
}) {
  const tracking = useBriefTracking([isActive, isCompleted, color]);
  if (!activity.venue) return null;

  const fill = isCompleted ? "#34c759" : color;
  const size = isActive ? 38 : 28;

  return (
    <Marker
      coordinate={{
        latitude: activity.venue.latitude,
        longitude: activity.venue.longitude,
      }}
      tracksViewChanges={tracking}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={isActive ? 10 : 1}
    >
      <View
        style={{
          width: 48,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isActive && (
          <View
            style={{
              position: "absolute",
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: fill,
              opacity: 0.25,
            }}
          />
        )}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: fill,
            borderWidth: isActive ? 3 : 2,
            borderColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: isActive ? 16 : 13,
              fontWeight: "900",
            }}
          >
            {isCompleted ? "✓" : activity.order + 1}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

// ---------------------------------------------------------------------------
// GLAVNA KOMPONENTA
// ---------------------------------------------------------------------------
export function PlanMyDayModal({
  visible,
  userLocation,
  onClose,
  onMarkVisited,
  visits = [],
  PlaceDetailModalComponent,
}: PlanMyDayModalProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDC(isDark);

  const [step, setStep] = useState<PlanStep>("form");
  const [destination, setDestination] = useState("");
  // Provjera postoji li uneseno mjesto/grad — prije se bilo koji tekst
  // prihvaćao bez ikakve provjere, pa je tipfeler u nazivu grada tiho
  // proizvodio prazan/pokvaren plan bez ijedne poruke greške.
  const [locationValid, setLocationValid] = useState(false);
  const [destCoords, setDestCoords] = useState<{
    latitude: number;
    longitude: number;
    displayName: string;
  } | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<
    { displayName: string; lat: string; lon: string }[]
  >([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const suggestSeqRef = useRef(0);
  const [numDays, setNumDays] = useState(1);
  const [planStyle, setPlanStyle] = useState<PlanStyle>("kulturno");
  const [spontaneous, setSpontaneous] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [companions, setCompanions] = useState<CompanionType | null>(null);
  const [transport, setTransport] = useState<TransportType | null>(null);
  const [budget, setBudget] = useState("");
  const [activityRadius, setActivityRadius] = useState<number | null>(null);
  const [interests, setInterests] = useState<string[]>([]);

  const [activeDay, setActiveDay] = useState(0);
  const [activeStop, setActiveStop] = useState<number>(0);
  const [completedStops, setCompletedStops] = useState<Set<number>>(new Set());

  const [result, setResult] = useState("");
  const [allVenues, setAllVenues] = useState<Record<string, VenueItem[]>>({});
  const [geocodedCoords, setGeocodedCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [generatedNumDays, setGeneratedNumDays] = useState(1);
  // Stil s kojim je plan generiran — prikaz na karti mora ostati isti i
  // ako korisnik nakon generiranja promijeni izbor u formi.
  const [generatedStyle, setGeneratedStyle] = useState<PlanStyle>("kulturno");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const [loadingStep, setLoadingStep] = useState(0);
  const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // Generiranje: jedan pokušaj odjednom, i oznaka tekućeg pokušaja. Bez toga je
  // drugi dodir (ili ponovno generiranje) pokretao paralelni upit, a prvi je
  // interval za animaciju učitavanja ostajao živ zauvijek — modal se tada
  // ponovno iscrtavao svake 2 sekunde i usporavao kartu i sve ostalo.
  const generatingRef = useRef(false);
  const generationIdRef = useRef(0);

  useEffect(
    () => () => {
      generationIdRef.current++;
      if (loadingInterval.current) clearInterval(loadingInterval.current);
    },
    [],
  );
  const [localVisitedIds, setLocalVisitedIds] = useState<Set<string>>(
    new Set(),
  );

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [planRating, setPlanRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const mapRef = useRef<MapView>(null);
  // Vanjski ScrollView — da se nakon odabira mjesta iz popisa vrati gore na
  // kartu; inače korisnik dotakne kafić i ne vidi da se išta dogodilo.
  const pageScrollRef = useRef<ScrollView>(null);
  /**
   * Mjesto koje korisnik razgledava na karti.
   *
   * Popis kafića/parkova/kina davao je samo naziv, adresu i udaljenost u
   * kilometrima — a "2.9 km" ne kaže je li to niz ulicu ili na drugu stranu
   * grada. Sad se dodirom mjesto pokaže na karti zajedno s korisnikovim
   * položajem, pa se vidi kamo zapravo treba.
   */
  /** Objave oko grada za koji je plan napravljen. */
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const [previewVenue, setPreviewVenue] = useState<{
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
    type?: string;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Način putovanja do odabranog mjesta; null = nije odabran, pa se predlaže
  // prema udaljenosti. Početna vrijednost dolazi iz izbora "Prijevoz" u formi.
  const [navMode, setNavMode] = useState<TravelMode | null>(null);
  // Položaj se čita preko refa da svaki GPS fix ne bi ponovno pomicao kameru
  // dok korisnik razgledava kartu.
  const userLocRef = useRef(userLocation);
  userLocRef.current = userLocation;

  const LOADING_MESSAGES = [
    { icon: "", text: t("plan.loadingMsg1") },
    { icon: "", text: t("plan.loadingMsg2") },
    { icon: "", text: t("plan.loadingMsg3") },
    { icon: "", text: t("plan.loadingMsg4") },
    { icon: "", text: t("plan.loadingMsg5") },
  ];

  // Budi poslužitelj čim se plan otvori: dok korisnik upisuje odredište, on se
  // već diže, pa prvi upit ne dočeka hladan start.
  useEffect(() => {
    if (visible) fetch(API_BASE_URL, { method: "HEAD" }).catch(() => {});
  }, [visible]);

  useEffect(() => {
    setLocalVisitedIds(new Set(visits.map((v) => v.placeId)));
  }, [visits]);

  useEffect(() => {
    setActiveStop(0);
    setCompletedStops(new Set());
  }, [activeDay]);

  // Aktivne aktivnosti za dan (prikaz po satima + markeri na karti).
  // Mora dobiti iste postavke kao i tekstualni plan, inače bi prikaz na
  // ekranu i podijeljeni tekst plana pokazivali različita vremena.
  const activeDayActivities: DayActivity[] = useMemo(() => {
    if (geocodedCoords && Object.keys(allVenues).length > 0) {
      const now = new Date();
      return getTimeBasedActivities(
        allVenues,
        activeDay,
        planStartFor(spontaneous, userLocation, geocodedCoords),
        t,
        {
          spontaneous,
          nowMinutes: now.getHours() * 60 + now.getMinutes(),
          style: generatedStyle,
          dayCount: generatedNumDays,
        },
      );
    }
    return [];
  }, [
    allVenues,
    activeDay,
    geocodedCoords,
    t,
    spontaneous,
    generatedStyle,
    generatedNumDays,
    userLocation,
  ]);

  /**
   * Postavlja kameru tako da se vide I korisnik I odabrano mjesto — na temelju
   * toga se bira kamo ići. Ako je korisnik predaleko (plan za drugi grad) ili
   * nije poznat, kamera ide samo na mjesto. Za iznimno blizu mjesto ne radi
   * se "fit" (zumirao bi do krova), nego se centrira između njih.
   */
  const focusOn = React.useCallback(
    (target: { latitude: number; longitude: number }) => {
      const map = mapRef.current;
      if (!map) return;
      const user = userLocRef.current;
      const km = user
        ? haversineKm(
            user.latitude,
            user.longitude,
            target.latitude,
            target.longitude,
          )
        : null;

      if (user && km !== null && km <= FAR_KM) {
        if (km < 0.25) {
          map.animateToRegion(
            {
              latitude: (user.latitude + target.latitude) / 2,
              longitude: (user.longitude + target.longitude) / 2,
              latitudeDelta: 0.006,
              longitudeDelta: 0.006,
            },
            500,
          );
        } else {
          map.fitToCoordinates([user, target], {
            edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
            animated: true,
          });
        }
        return;
      }
      map.animateToRegion(
        { ...target, latitudeDelta: 0.015, longitudeDelta: 0.015 },
        500,
      );
    },
    [],
  );

  /** Cijeli dan na jednoj slici: sve postaje i korisnik (ako je blizu). */
  const fitWholeDay = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const coords: { latitude: number; longitude: number }[] =
      activeDayActivities
        .filter((a) => a.venue)
        .map((a) => ({
          latitude: a.venue!.latitude,
          longitude: a.venue!.longitude,
        }));
    const user = userLocRef.current;
    if (
      user &&
      coords.length > 0 &&
      haversineKm(
        user.latitude,
        user.longitude,
        coords[0].latitude,
        coords[0].longitude,
      ) <= FAR_KM
    ) {
      coords.push(user);
    }
    if (coords.length === 0) return;
    map.fitToCoordinates(coords, {
      edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
      animated: true,
    });
  }, [activeDayActivities]);

  // Kamera prati odabranu postaju (ili mjesto razgledano iz popisa). Prije su
  // postojala dva efekta koja su istodobno pomicala kameru — jedan na sve
  // postaje, drugi na jednu — pa je ishod ovisio o tome koji je zadnji stigao.
  const focusTarget =
    previewVenue ?? activeDayActivities[activeStop]?.venue ?? null;
  useEffect(() => {
    if (!mapReady || !focusTarget) return;
    const id = setTimeout(() => focusOn(focusTarget), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, focusTarget?.latitude, focusTarget?.longitude, focusOn]);

  const reset = () => {
    setStep("form");
    setResult("");
    setAllVenues({});
    setGeocodedCoords(null);
    setActiveDay(0);
    setActiveStop(0);
    setCompletedStops(new Set());
    setMapReady(false);
    setPreviewVenue(null);
    setNavMode(null);
    setExpandedCategories(new Set());
    setPlanRating(0);
    setRatingSubmitted(false);
    setGeneratedNumDays(1);
    setLoadingStep(0);
    // ← DODAJ OVO:
    setCompanions(null);
    setTransport(null);
    setBudget("");
    setActivityRadius(null);
    setInterests([]);
    setSpontaneous(false);
    setDestination("");
    setDestCoords(null);
    setNumDays(1);
    // Zatvaranje prekida tekuće generiranje: njegov kasni odgovor se odbacuje.
    generationIdRef.current++;
    generatingRef.current = false;
    if (loadingInterval.current) clearInterval(loadingInterval.current);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isVenueVisited = (venue: VenueItem, type: string) => {
    const id = `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`;
    return localVisitedIds.has(id);
  };

  const handleMarkVisited = async (venue: VenueItem | null, type: string) => {
    if (!venue) return;
    const id = `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`;
    if (localVisitedIds.has(id)) return;
    setLocalVisitedIds((prev) => new Set([...prev, id]));
    if (onMarkVisited) {
      await onMarkVisited({
        id,
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        type: type as Place["type"],
        address: venue.address,
      });
    }
  };

  const submitRating = async () => {
    if (planRating === 0) return;
    setRatingLoading(true);
    setRatingError(null);
    try {
      // Ovdje su stajali ključevi "userToken" i "userData" — nijedan se
      // nigdje ne upisuje (komentar uz njih je i priznavao nesigurnost).
      // Token je zato uvijek bio prazan, a ime korisnika također, pa je
      // SVAKA ocjena plana stizala adminu kao "Anonimni korisnik". Nije
      // pucalo jer je ruta /api/plan-ratings namjerno dostupna i bez
      // prijave — samo se tiho gubilo tko je ocijenio.
      const [token, firstName, lastName] = await Promise.all([
        getToken(),
        AsyncStorage.getItem("firstName"),
        AsyncStorage.getItem("lastName"),
      ]);
      const userName =
        `${firstName ?? ""} ${lastName ?? ""}`.trim() || t("plan.anonymous");

      const response = await fetch(`${API_BASE_URL}/api/plan-ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rating: planRating,
          destination,
          userName,
        }),
      });

      if (!response.ok) throw new Error("Server error");
      setRatingSubmitted(true);
    } catch {
      setRatingError(t("plan.ratingError"));
    } finally {
      setRatingLoading(false);
    }
  };

  const searchDestination = (query: string) => {
    setDestination(query);
    setLocationValid(false);
    setDestCoords(null);

    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);

    if (query.trim().length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    locationDebounceRef.current = setTimeout(async () => {
      const reqId = ++suggestSeqRef.current;
      setSearchingLocation(true);
      try {
        const token = await getToken();
        const data = await fetchDestinationSuggestions(query, token);
        // Sporiji odgovor na ranije slovo ne smije prebrisati noviji.
        if (reqId !== suggestSeqRef.current) return;
        setLocationSuggestions(data);
        setShowLocationSuggestions(data.length > 0);
      } catch {
        if (reqId === suggestSeqRef.current) setLocationSuggestions([]);
      } finally {
        if (reqId === suggestSeqRef.current) setSearchingLocation(false);
      }
    }, 400);
  };

  const selectDestination = (suggestion: {
    displayName: string;
    lat?: string;
    lon?: string;
  }) => {
    setDestination(suggestion.displayName);
    const lat = parseFloat(suggestion.lat ?? "");
    const lon = parseFloat(suggestion.lon ?? "");
    setDestCoords(
      Number.isFinite(lat) && Number.isFinite(lon)
        ? { latitude: lat, longitude: lon, displayName: suggestion.displayName }
        : null,
    );
    setLocationValid(true);
    setShowLocationSuggestions(false);
    setLocationSuggestions([]);
  };

  const generate = React.useCallback(async () => {
    if (!destination.trim()) {
      Alert.alert(t("plan.destination"), t("plan.destinationRequired"));
      return;
    }
    if (!locationValid) {
      Alert.alert(t("plan.destination"), t("plan.destinationNotVerified"));
      return;
    }

    // Već traje: drugi dodir ne smije pokrenuti paralelni upit.
    if (generatingRef.current) return;
    generatingRef.current = true;
    const runId = ++generationIdRef.current;

    setLoadingStep(0);
    setStep("loading");
    const tPlan = Date.now();
    if (__DEV__) {
      console.log(
        `[plan] generating for "${destination}", known coords: ${destCoords ? "yes" : "no"}, radius ${activityRadius ?? 5} km`,
      );
    }

    // Prethodni interval se uvijek ugasi prije novog (inače curi).
    if (loadingInterval.current) clearInterval(loadingInterval.current);
    loadingInterval.current = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    try {
      const query = [destination.trim(), "Hrvatska"].join(" ");
      // Vremenski okvir: bez njega je plan uz spor izvor mogao "vrtjeti" i
      // minutama, a korisnik ne zna čeka li još ili je pokvareno.
      let budgetTimer: ReturnType<typeof setTimeout> | undefined;
      const { geocoded, venues } = await Promise.race([
        fetchVenuesNearCity(
          query,
          activityRadius ?? 5, // fallback na 5km ako nije odabrano
          interests,
          destCoords,
        ),
        new Promise<never>((_, reject) => {
          budgetTimer = setTimeout(
            () => reject(new Error("plan-timeout")),
            PLAN_FETCH_BUDGET_MS,
          );
        }),
      ]).finally(() => clearTimeout(budgetTimer));

      // Modal je u međuvremenu zatvoren ili je pokrenut novi pokušaj.
      if (runId !== generationIdRef.current) return;

      if (__DEV__) {
        console.log(
          `[plan] venues ready in ${Date.now() - tPlan}ms: ${Object.entries(
            venues,
          )
            .map(([k, v]) => `${k}=${v.length}`)
            .join(" ")}`,
        );
      }

      // Nema ni jednog mjesta: prije se ovdje ipak "gradio" prazan plan i
      // prikazivao kao uspjeh. Najčešće je uzrok privremen (servisi s kojih se
      // mjesta dohvaćaju su preopterećeni), pa korisnik dobiva jasan savjet i
      // ostaje na formi da može odmah ponoviti.
      if (!geocoded || Object.keys(venues).length === 0) {
        if (loadingInterval.current) clearInterval(loadingInterval.current);
        Alert.alert(
          t("plan.destination"),
          geocoded ? t("plan.noVenues") : t("plan.planError"),
        );
        setStep("form");
        return;
      }

      setAllVenues(venues);
      setGeocodedCoords(
        geocoded
          ? { latitude: geocoded.latitude, longitude: geocoded.longitude }
          : null,
      );
      setGeneratedNumDays(spontaneous ? 1 : numDays);
      setGeneratedStyle(planStyle);
      setPreviewVenue(null);
      setNavMode(modeFromTransport(transport));

      if (loadingInterval.current) clearInterval(loadingInterval.current);

      // Generiraj tekstualni plan
      let planText = `🗺️ PLAN PUTOVANJA — ${destination.toUpperCase()}\n\n`;
      for (let d = 0; d < (spontaneous ? 1 : numDays); d++) {
        const now = new Date();
        const activities = getTimeBasedActivities(
          venues,
          d,
          planStartFor(spontaneous, userLocation, geocoded),
          t,
          {
            // Spontani plan ("zatekao sam se u gradu") kreće od trenutnog
            // vremena — dosad je i on počinjao doručkom u 08:00, pa je u
            // 16h bio neupotrebljiv.
            spontaneous,
            nowMinutes: now.getHours() * 60 + now.getMinutes(),
            // Vrsta putovanja (opušteno / kulturno / avantura) dosad se nigdje
            // nije koristila — plan je za sva tri izbora bio identičan.
            style: planStyle,
            dayCount: spontaneous ? 1 : numDays,
          },
        );
        planText += `DAN ${d + 1}\n${"─".repeat(40)}\n\n`;
        activities.forEach((act) => {
          planText += `⏰ ${act.time} – ${act.venueName} ${EMOJIS[act.venueType] || "📍"}\n`;
          planText += `💬 Zašto: ${act.description}\n`;
          if (act.travelMinutes > 0)
            planText += `🚶 Put: ~${act.travelMinutes} min od prethodne postaje\n`;
          planText += `⏱️ Trajanje: ${act.duration} min\n`;
          planText += `💶 Trošak: ~${act.cost} EUR\n\n`;
        });
        planText += `💰 Ukupno dan ${d + 1}: ~${activities.reduce((sum, a) => sum + parseInt(a.cost.split("-")[0] || "10"), 0)}-${activities.reduce((sum, a) => sum + parseInt(a.cost.split("-")[1] || "30"), 0)} EUR\n`;
        planText += `💡 Savjet: Preporučujemo rezervaciju restorana unaprijed!\n\n`;
      }
      planText += `✨ Ugodan boravak u ${destination}!`;
      setResult(planText);

      setStep("result");
    } catch (err) {
      if (runId !== generationIdRef.current) return;
      if (__DEV__) {
        console.log(
          `[plan] FAILED after ${Date.now() - tPlan}ms:`,
          String(err),
        );
      }
      if (loadingInterval.current) clearInterval(loadingInterval.current);
      const slow =
        err instanceof Error &&
        (err.message === "places-unavailable" ||
          err.message === "plan-timeout");
      Alert.alert(
        t("common.error"),
        slow ? t("plan.placesUnavailable") : t("plan.planError"),
      );
      setStep("form");
    } finally {
      // Samo tekući pokušaj otpušta "zaključavanje"; zastarjeli ga ne dira.
      if (runId === generationIdRef.current) generatingRef.current = false;
    }
  }, [
    destination,
    locationValid,
    destCoords,
    activityRadius,
    interests,
    spontaneous,
    numDays,
    // planStyle je nedostajao: povratni poziv je pamtio STARI stil pa je plan
    // bio generiran s prethodno odabranim, a ne s trenutnim.
    planStyle,
    transport,
    userLocation,
    t,
  ]);

  /**
   * Pokaži mjesto iz popisa na karti, zajedno s korisnikom.
   *
   * fitToCoordinates umjesto animateToRegion: bitno je vidjeti OBOJE — i
   * mjesto i sebe — jer se na temelju toga bira kamo ići. Kad položaj
   * korisnika nije poznat, karta se samo približi mjestu.
   */
  const showVenueOnMap = (venue: {
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
    type?: string;
  }) => {
    setPreviewVenue(venue);
    pageScrollRef.current?.scrollTo({ y: 0, animated: true });
    focusOn(venue);
  };

  /** Odaberi postaju plana: karta, kartica i popis prate isti odabir. */
  const selectStop = (idx: number, opts?: { scrollToTop?: boolean }) => {
    setPreviewVenue(null);
    setActiveStop(idx);
    const venue = activeDayActivities[idx]?.venue;
    if (venue) focusOn(venue);
    if (opts?.scrollToTop) {
      pageScrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const openVenueDetail = (activity: DayActivity) => {
    if (!activity.venue) return;
    setSelectedPlace({
      id: `plan_${activity.venueType}_${activity.venue.name}`,
      name: activity.venue.name,
      latitude: activity.venue.latitude,
      longitude: activity.venue.longitude,
      type: activity.venueType as Place["type"],
      address: activity.venue.address,
    });
    setShowDetailModal(true);
  };

  const handleToggleInterest = React.useCallback((id: string) => {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Render — LOADING
  // ---------------------------------------------------------------------------
  if (step === "loading") {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={handleClose}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: DC.bg,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
          }}
        >
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={{ fontSize: 48, marginTop: 24 }}>
            {LOADING_MESSAGES[loadingStep].icon}
          </Text>
          <Text
            style={{
              fontSize: T.title,
              fontWeight: "700",
              color: DC.text,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {LOADING_MESSAGES[loadingStep].text}
          </Text>
          <ProgressBar step={loadingStep} total={LOADING_MESSAGES.length} />
          <Text
            style={{
              fontSize: T.meta,
              color: DC.textDim,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {t("plan.findingPlaces", { destination })}
          </Text>
        </View>
      </Modal>
    );
  }

  // ---------------------------------------------------------------------------
  // Kartica odabrane postaje: što je, koliko je daleko, kako tamo, i gumb
  // "Navigiraj". Sve što je prije bilo razbacano po traci iznad karte,
  // natpisu preko karte i redu popisa sada je na jednom mjestu.
  // ---------------------------------------------------------------------------
  const renderStopCard = () => {
    const activity = activeDayActivities[activeStop] ?? null;
    const isPreview = previewVenue !== null;
    const venue = isPreview ? previewVenue : (activity?.venue ?? null);
    if (!venue) return null;

    const type = isPreview ? previewVenue.type : activity?.venueType;
    const cat = type
      ? placeCategories[type as keyof typeof placeCategories]
      : undefined;
    const routeColor = ROUTE_COLORS[activeDay % ROUTE_COLORS.length];
    const color = cat?.color ?? routeColor;
    const total = activeDayActivities.length;

    const km = userLocation
      ? haversineKm(
          userLocation.latitude,
          userLocation.longitude,
          venue.latitude,
          venue.longitude,
        )
      : null;
    const far = km !== null && km > FAR_KM;
    const mode = navMode ?? suggestMode(km);

    const visited = type ? isVenueVisited(venue, type) : false;
    const done = isPreview
      ? visited
      : completedStops.has(activeStop) || visited;

    const tips: string[] = [];
    if (km === null || !userLocation) {
      tips.push(t("plan.tipNoLocation"));
    } else if (km < 0.15) {
      tips.push(t("plan.tipHere"));
    } else if (far) {
      tips.push(t("plan.tipFar", { dist: formatDistance(km) }));
    } else {
      tips.push(
        t("plan.tipDirection", {
          dir: t(`plan.compass.${compassDirection(userLocation, venue)}`),
          dist: formatDistance(km),
        }),
      );
      tips.push(t(`plan.tipMode_${suggestMode(km)}`));
    }
    if (mode === "transit" && km !== null && km >= 0.15 && !far) {
      const hour = activity ? parseInt(activity.time.slice(0, 2), 10) : 0;
      if (type === "club" || hour >= 21) tips.push(t("plan.tipLateTransit"));
    }

    const openDetail = () => {
      if (!isPreview && activity) {
        openVenueDetail(activity);
        return;
      }
      setSelectedPlace({
        id: `plan_${type ?? "landmark"}_${venue.name}`,
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        type: (type ?? "landmark") as Place["type"],
        address: venue.address,
      });
      setShowDetailModal(true);
    };

    const markDone = async () => {
      await handleMarkVisited(venue, type ?? "landmark");
      if (!isPreview) {
        setCompletedStops((prev) => new Set([...prev, activeStop]));
        if (activeStop + 1 < total) selectStop(activeStop + 1);
      }
    };

    const stepBtn = (label: string, disabled: boolean, onPress: () => void) => (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: DC.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <Text style={{ color: DC.text, fontSize: T.body, fontWeight: "800" }}>
          {label}
        </Text>
      </TouchableOpacity>
    );

    return (
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 12,
          backgroundColor: DC.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: DC.borderDim,
          padding: 14,
        }}
      >
        {/* Zaglavlje: gdje smo u planu */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: T.caption,
              fontWeight: "800",
              color: DC.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {isPreview
              ? t("plan.previewLabel")
              : total > 1
                ? t("plan.stopOf", { current: activeStop + 1, total })
                : t("plan.yourStop")}
          </Text>
          {isPreview ? (
            <TouchableOpacity
              onPress={() => selectStop(activeStop)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                style={{
                  color: DC.accent,
                  fontSize: T.meta,
                  fontWeight: "700",
                }}
              >
                ✕ {t("plan.backToPlan")}
              </Text>
            </TouchableOpacity>
          ) : (
            total > 1 && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {stepBtn("‹", activeStop === 0, () =>
                  selectStop(activeStop - 1),
                )}
                {stepBtn("›", activeStop >= total - 1, () =>
                  selectStop(activeStop + 1),
                )}
              </View>
            )
          )}
        </View>

        {/* Naziv */}
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: color + "22",
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20 }}>
              {(type && EMOJIS[type]) || "📍"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: T.lead, fontWeight: "800", color: DC.text }}
              numberOfLines={2}
            >
              {venue.name}
            </Text>
            {!isPreview && activity && (
              <Text
                style={{ fontSize: T.meta, color: DC.textSub, marginTop: 2 }}
                numberOfLines={2}
              >
                {activity.description}
              </Text>
            )}
            {venue.address ? (
              <Text
                style={{ fontSize: T.caption, color: DC.textDim, marginTop: 2 }}
                numberOfLines={1}
              >
                📍 {venue.address}
              </Text>
            ) : null}
          </View>
          {!isPreview && activity && (
            <Text
              style={{ fontSize: T.lead, fontWeight: "800", color: routeColor }}
            >
              {activity.time}
            </Text>
          )}
        </View>

        {/* Trajanje i cijena */}
        {!isPreview && activity && (
          <Text style={{ fontSize: T.meta, color: DC.textSub, marginTop: 10 }}>
            ⏱ {formatDuration(activity.duration)} · 💶 ~{activity.cost} EUR
          </Text>
        )}

        {/* Kako tamo */}
        <View
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            backgroundColor: DC.bg,
            gap: 8,
          }}
        >
          {km !== null && (
            <Text
              style={{ fontSize: T.meta, fontWeight: "800", color: DC.text }}
            >
              📍 {formatDistance(km)} {t("plan.fromYou")}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {TRAVEL_MODES.map((m) => {
              const selected = m === mode;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setNavMode(m)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`plan.mode.${m}`)}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: selected ? DC.accent : DC.borderDim,
                    backgroundColor: selected
                      ? DC.accent + "28"
                      : "transparent",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: T.body }}>
                    {TRAVEL_MODE_ICON[m]}
                  </Text>
                  {km !== null && !far && (
                    <Text
                      style={{
                        fontSize: T.caption,
                        color: selected ? DC.text : DC.textDim,
                        fontWeight: selected ? "800" : "500",
                      }}
                      numberOfLines={1}
                    >
                      ~{formatDuration(estimateMinutes(km, m))}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {tips.map((tip, i) => (
            <Text
              key={i}
              style={{
                fontSize: T.caption + 1,
                color: DC.textSub,
                lineHeight: 16,
              }}
            >
              {i === 0 ? "💡 " : "• "}
              {tip}
            </Text>
          ))}
        </View>

        {/* Akcije */}
        <TouchableOpacity
          onPress={() =>
            openDirections(venue, mode, () =>
              Alert.alert(t("common.error"), t("plan.navError")),
            )
          }
          style={{
            marginTop: 12,
            backgroundColor: DC.accent,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: T.body, fontWeight: "800" }}>
            🧭 {t("plan.navigate")}
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TouchableOpacity
            onPress={openDetail}
            style={{
              flex: 1,
              paddingVertical: 11,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: DC.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{ color: DC.text, fontSize: T.meta, fontWeight: "700" }}
            >
              {t("plan.details")}
            </Text>
          </TouchableOpacity>
          {done ? (
            <View
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#34c759",
                backgroundColor: "#34c75922",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#34c759",
                  fontSize: T.meta,
                  fontWeight: "800",
                }}
              >
                ✓ {t("plan.visitedDone")}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={markDone}
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: "#34c759",
                alignItems: "center",
              }}
            >
              <Text
                style={{ color: "#fff", fontSize: T.meta, fontWeight: "800" }}
              >
                {t("plan.visitedMark")} ✓
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Vremenska crta dana: vrijeme | točka na tračnici | naziv i jedan redak
  // podataka. Put između postaja je spojnica na tračnici, ne zaseban tekst.
  // ---------------------------------------------------------------------------
  const renderTimeline = () => {
    const total = activeDayActivities.length;
    if (total <= 1) return null; // jedna postaja = kartica iznad je cijeli plan

    const routeColor = ROUTE_COLORS[activeDay % ROUTE_COLORS.length];
    const firstVenue = activeDayActivities[0]?.venue ?? null;
    const showYou =
      !!userLocation &&
      !!firstVenue &&
      haversineKm(
        userLocation.latitude,
        userLocation.longitude,
        firstVenue.latitude,
        firstVenue.longitude,
      ) <= FAR_KM;

    const rail = (opts: {
      lineTop: boolean;
      lineBottom: boolean;
      dot?: React.ReactNode;
    }) => (
      <View
        style={{
          width: 28,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "stretch",
        }}
      >
        {(opts.lineTop || opts.lineBottom) && (
          <View
            style={{
              position: "absolute",
              width: 2,
              backgroundColor: DC.border,
              top: opts.lineTop ? 0 : "50%",
              bottom: opts.lineBottom ? 0 : "50%",
            }}
          />
        )}
        {opts.dot}
      </View>
    );

    /** Put između dviju točaka: ikona načina putovanja i procjena. */
    const connector = (
      key: string,
      from: { latitude: number; longitude: number },
      to: { latitude: number; longitude: number },
    ) => {
      const km = haversineKm(
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude,
      );
      const m = navMode ?? suggestMode(km);
      return (
        <View key={key} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 46 }} />
          {rail({ lineTop: true, lineBottom: true })}
          <Text
            style={{
              fontSize: T.caption,
              color: DC.textDim,
              paddingVertical: 4,
              paddingLeft: 10,
            }}
          >
            {TRAVEL_MODE_ICON[m]} ~{formatDuration(estimateMinutes(km, m))} ·{" "}
            {formatDistance(km)}
          </Text>
        </View>
      );
    };

    return (
      <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 4 }}>
        <Text
          style={{
            fontSize: T.meta,
            fontWeight: "700",
            color: DC.textSub,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          {generatedNumDays > 1
            ? t("plan.dayPlanLabel", { day: activeDay + 1 })
            : t("plan.hourlyPlan")}
        </Text>
        <View
          style={{
            backgroundColor: DC.card,
            borderRadius: 16,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: DC.borderDim,
          }}
        >
          {showYou && userLocation && firstVenue && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 46 }} />
                {rail({
                  lineTop: false,
                  lineBottom: true,
                  dot: (
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: "#1e88e5",
                        borderWidth: 2.5,
                        borderColor: "#fff",
                      }}
                    />
                  ),
                })}
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.text,
                    paddingVertical: 8,
                    paddingLeft: 10,
                  }}
                >
                  {t("plan.youAreHere")}
                </Text>
              </View>
              {connector("c_you", userLocation, firstVenue)}
            </>
          )}
          {activeDayActivities.map((activity, idx) => {
            const isActive = !previewVenue && activeStop === idx;
            const venueVisited = activity.venue
              ? isVenueVisited(activity.venue, activity.venueType)
              : false;
            const isDone = completedStops.has(idx) || venueVisited;
            const catColor =
              placeCategories[
                activity.venueType as keyof typeof placeCategories
              ]?.color ?? routeColor;
            const prev = idx > 0 ? activeDayActivities[idx - 1].venue : null;

            return (
              <React.Fragment key={`tl_${idx}`}>
                {idx > 0 &&
                  prev &&
                  activity.venue &&
                  connector(`c_${idx}`, prev, activity.venue)}
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={!activity.venue}
                  onPress={() => selectStop(idx, { scrollToTop: true })}
                  style={{
                    flexDirection: "row",
                    alignItems: "stretch",
                    borderRadius: 10,
                    backgroundColor: isActive ? catColor + "1c" : "transparent",
                  }}
                >
                  <View style={{ width: 46, justifyContent: "center" }}>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "800",
                        color: isActive ? DC.text : DC.textSub,
                      }}
                    >
                      {activity.time}
                    </Text>
                  </View>
                  {rail({
                    lineTop: idx > 0 || showYou,
                    lineBottom: idx < total - 1,
                    dot: (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: isDone ? "#34c759" : catColor,
                          borderWidth: isActive ? 3 : 0,
                          borderColor: "#fff",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: "900",
                          }}
                        >
                          {isDone ? "✓" : idx + 1}
                        </Text>
                      </View>
                    ),
                  })}
                  <View
                    style={{ flex: 1, paddingVertical: 10, paddingLeft: 10 }}
                  >
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: isDone ? "#34c759" : DC.text,
                      }}
                      numberOfLines={2}
                    >
                      {activity.venueName}
                    </Text>
                    <Text
                      style={{
                        fontSize: T.caption,
                        color: DC.textDim,
                        marginTop: 2,
                      }}
                      numberOfLines={2}
                    >
                      {EMOJIS[activity.venueType] || "📍"}{" "}
                      {activity.description} ·{" "}
                      {formatDuration(activity.duration)} · ~{activity.cost} EUR
                    </Text>
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Render — RESULT
  // ---------------------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: DC.bg }}>
        {/* HEADER */}
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
          {/* Na ekranu forme naslov zauzima svu slobodnu širinu, pa gumb
              "Zatvori" ide skroz uz desni rub (i ostaje okomito centriran
              zbog alignItems: "center" na retku). Prije nijedna strana nije
              imala flex, pa su naslov i gumb stajali jedan do drugoga i
              gumb je izgledao zalijepljen uz naslov. Na ekranu rezultata
              raspored ostaje kakav je bio — ondje sredinu drži naziv
              destinacije. */}
          <View style={{ flex: step === "result" ? 0 : 1, flexShrink: 1 }}>
            {step === "result" ? (
              <TouchableOpacity onPress={() => setStep("form")}>
                <Text
                  style={{
                    fontSize: T.body,
                    color: DC.accent,
                    fontWeight: "700",
                  }}
                  numberOfLines={1}
                >
                  {t("plan.newPlan")}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
                numberOfLines={1}
              >
                {t("plan.planTrip")}
              </Text>
            )}
          </View>

          {step === "result" && (
            <Text
              style={{
                flex: 1,
                fontSize: T.lead,
                fontWeight: "800",
                color: DC.text,
                textAlign: "center",
                marginHorizontal: 8,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {destination}
            </Text>
          )}

          {step === "result" ? (
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <TouchableOpacity
                onPress={() => Share.share({ message: result }).catch(() => {})}
              >
                <Text
                  style={{
                    fontSize: T.body,
                    color: DC.textDim,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {t("plan.share")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose}>
                <Text
                  style={{
                    fontSize: T.body,
                    color: DC.textDim,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {t("common.close")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={handleClose} style={{ flexShrink: 0 }}>
              <Text
                style={{
                  fontSize: T.body,
                  color: DC.textDim,
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ========== FORMA ========== */}
        {step === "form" && (
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
            <ScrollView
              contentContainerStyle={{ paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              style={{ backgroundColor: DC.bg }}
            >
              {/* SPONTANO */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  margin: 16,
                  marginBottom: 8,
                  padding: 14,
                  backgroundColor: spontaneous ? DC.gold + "22" : DC.card,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: spontaneous ? DC.gold : DC.borderDim,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: T.body,
                      fontWeight: "700",
                      color: DC.text,
                    }}
                  >
                    {t("plan.spontaneous")}
                  </Text>
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.textDim,
                      marginTop: 2,
                    }}
                  >
                    {t("plan.spontaneousDesc")}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    width: 50,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: spontaneous ? DC.gold : DC.borderDim,
                    justifyContent: "center",
                    paddingHorizontal: 3,
                    alignItems: spontaneous ? "flex-end" : "flex-start",
                  }}
                  onPress={() => {
                    const next = !spontaneous;
                    setSpontaneous(next);
                    if (next) setNumDays(1);
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: "#fff",
                    }}
                  />
                </TouchableOpacity>
              </View>

              {/* DESTINACIJA */}
              <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 6,
                  }}
                >
                  {t("plan.whereGoing")}
                </Text>
                <View
                  style={{ position: "relative", justifyContent: "center" }}
                >
                  <TextInput
                    selectTextOnFocus
                    style={{
                      backgroundColor: DC.card,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: locationValid ? "#4CAF50" : DC.inputBorder,
                      paddingHorizontal: 16,
                      paddingVertical: 13,
                      paddingRight: 40,
                      fontSize: T.lead,
                      color: DC.text,
                      fontWeight: "600",
                    }}
                    placeholder={t("plan.destinationExample")}
                    placeholderTextColor={DC.textDim}
                    value={destination}
                    onChangeText={searchDestination}
                    autoCapitalize="words"
                  />
                  {searchingLocation && (
                    <ActivityIndicator
                      size="small"
                      color={DC.textDim}
                      style={{ position: "absolute", right: 14 }}
                    />
                  )}
                  {!searchingLocation && locationValid && (
                    <Text
                      style={{
                        position: "absolute",
                        right: 14,
                        color: "#4CAF50",
                        fontSize: T.title,
                        fontWeight: "700",
                      }}
                    >
                      ✓
                    </Text>
                  )}
                </View>
                {!locationValid && destination.trim().length > 0 && (
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.textDim,
                      marginTop: 6,
                    }}
                  >
                    {t("plan.destinationPickFromList")}
                  </Text>
                )}
                {showLocationSuggestions && (
                  <View
                    style={{
                      backgroundColor: DC.card,
                      borderWidth: 1,
                      borderColor: DC.inputBorder,
                      borderRadius: 10,
                      marginTop: 4,
                      maxHeight: 220,
                      overflow: "hidden",
                    }}
                  >
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {locationSuggestions.map((s, idx) => (
                        <TouchableOpacity
                          key={`${s.lat}_${s.lon}_${idx}`}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderBottomWidth:
                              idx < locationSuggestions.length - 1 ? 1 : 0,
                            borderBottomColor: DC.inputBorder,
                          }}
                          onPress={() => selectDestination(s)}
                        >
                          <Text style={{ color: DC.text, fontSize: T.body }}>
                            {s.displayName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* KOLIKO DANA */}
              {!spontaneous && (
                <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                  <Text
                    style={{
                      fontSize: T.meta,
                      fontWeight: "700",
                      color: DC.textSub,
                      marginBottom: 10,
                    }}
                  >
                    {t("plan.howManyDays")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                  >
                    {[
                      {
                        val: 1,
                        label: t("plan.day1Label", { defaultValue: "1 dan" }),
                      },
                      {
                        val: 2,
                        label: t("plan.weekendLabel", {
                          defaultValue: "Vikend",
                        }),
                      },
                      {
                        val: 3,
                        label: t("plan.days3Label", { defaultValue: "3 dana" }),
                      },
                      {
                        val: 5,
                        label: t("plan.weekLabel", { defaultValue: "Tjedan" }),
                      },
                      {
                        val: 7,
                        label: t("plan.days7Label", { defaultValue: "7 dana" }),
                      },
                    ].map((o) => (
                      <TouchableOpacity
                        key={o.val}
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor:
                            numDays === o.val ? DC.cardHover : DC.card,
                          borderWidth: 1.5,
                          borderColor:
                            numDays === o.val ? DC.border : DC.borderDim,
                        }}
                        onPress={() => setNumDays(o.val)}
                      >
                        <Text
                          style={{
                            fontSize: T.body,
                            fontWeight: numDays === o.val ? "700" : "400",
                            color: numDays === o.val ? DC.text : DC.textDim,
                          }}
                        >
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* STIL */}
              <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 10,
                  }}
                >
                  {t("plan.tripStyle")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    {
                      val: "opusteno" as PlanStyle,
                      icon: APP_ICONS.styleRelaxed,
                      label: t("plan.styleRelaxed"),
                    },
                    {
                      val: "kulturno" as PlanStyle,
                      icon: APP_ICONS.styleCultural,
                      label: t("plan.styleCultural"),
                    },
                    {
                      val: "avantura" as PlanStyle,
                      icon: APP_ICONS.styleAdventure,
                      label: t("plan.styleAdventure"),
                    },
                  ].map((o) => (
                    <TouchableOpacity
                      key={o.val}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor:
                          planStyle === o.val ? DC.cardHover : DC.card,
                        borderWidth: 1.5,
                        borderColor:
                          planStyle === o.val ? DC.border : DC.borderDim,
                      }}
                      onPress={() => setPlanStyle(o.val)}
                    >
                      <Image
                        source={o.icon}
                        style={{ width: 44, height: 44, marginBottom: 6 }}
                        resizeMode="contain"
                      />
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: planStyle === o.val ? "700" : "500",
                          color: planStyle === o.val ? DC.text : DC.textDim,
                        }}
                      >
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* NAPREDNO */}
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginHorizontal: 16,
                  marginTop: 20,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                }}
                onPress={() => setShowAdvanced((v) => !v)}
              >
                <Text
                  style={{
                    fontSize: T.meta,
                    color: DC.textSub,
                    fontWeight: "600",
                  }}
                >
                  {t("plan.advancedOptions")}
                </Text>
                <Text style={{ fontSize: T.meta, color: DC.textDim }}>
                  {showAdvanced
                    ? t("plan.advancedHide")
                    : t("plan.advancedShow")}
                </Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View
                  style={{
                    marginHorizontal: 16,
                    padding: 14,
                    backgroundColor: DC.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DC.borderDim,
                    borderTopWidth: 0,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    gap: 16,
                  }}
                >
                  {/* S KIM */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.withWhom")}
                    </Text>
                    <View style={{ gap: 8 }}>
                      {[
                        {
                          val: "solo" as CompanionType,
                          icon: APP_ICONS.solo,
                          label: t("plan.companionSolo"),
                          emoji: "🧍",
                          desc: t("plan.companionSoloDesc"),
                        },
                        {
                          val: "partner" as CompanionType,
                          icon: APP_ICONS.partner,
                          label: t("plan.companionPartner"),
                          emoji: "💑",
                          desc: t("plan.companionPartnerDesc"),
                        },
                        {
                          val: "prijatelji" as CompanionType,
                          icon: APP_ICONS.prijatelji,
                          label: t("plan.companionFriends"),
                          emoji: "👯",
                          desc: t("plan.companionFriendsDesc"),
                        },
                        {
                          val: "obitelj" as CompanionType,
                          icon: APP_ICONS.obitelj,
                          label: t("plan.companionFamily"),
                          emoji: "👨‍👩‍👧‍👦",
                          desc: t("plan.companionFamilyDesc"),
                        },
                      ].map((o) => (
                        <TouchableOpacity
                          key={o.val}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor:
                              companions === o.val ? DC.cardHover : DC.bg,
                            borderWidth: 1.5,
                            borderColor:
                              companions === o.val ? DC.border : DC.borderDim,
                            gap: 10,
                          }}
                          onPress={() =>
                            setCompanions((prev) =>
                              prev === o.val ? null : o.val,
                            )
                          }
                        >
                          {o.icon ? (
                            <Image
                              source={o.icon}
                              style={{ width: 40, height: 40 }}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={{ fontSize: T.screen }}>
                              {o.emoji}
                            </Text>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: T.meta,
                                fontWeight:
                                  companions === o.val ? "700" : "500",
                                color:
                                  companions === o.val ? DC.text : DC.textDim,
                              }}
                            >
                              {o.label}
                            </Text>
                            <Text
                              style={{ fontSize: T.caption, color: DC.textDim }}
                            >
                              {o.desc}
                            </Text>
                          </View>
                          {companions === o.val && (
                            <Text
                              style={{ fontSize: T.lead, color: DC.accent }}
                            >
                              ✓
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* PRIJEVOZ */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.transportLabel")}
                    </Text>
                    <View
                      style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                    >
                      {[
                        {
                          val: "auto" as TransportType,
                          label: t("plan.car"),
                          icon: APP_ICONS.auto,
                        },
                        {
                          val: "javni" as TransportType,
                          label: t("plan.public"),
                          icon: APP_ICONS.javni,
                        },
                        {
                          val: "pjesice" as TransportType,
                          label: t("plan.walking"),
                          icon: APP_ICONS.pjesice,
                        },
                        {
                          val: "bicikl" as TransportType,
                          label: t("plan.bicycle"),
                          icon: APP_ICONS.bicikl,
                        },
                      ].map((o) => (
                        <TouchableOpacity
                          key={o.val}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor:
                              transport === o.val ? DC.cardHover : DC.bg,
                            borderWidth: 1,
                            borderColor:
                              transport === o.val ? DC.border : DC.borderDim,
                          }}
                          onPress={() =>
                            setTransport((prev) =>
                              prev === o.val ? null : o.val,
                            )
                          }
                        >
                          {o.icon && (
                            <Image
                              source={o.icon}
                              style={{ width: 28, height: 28 }}
                              resizeMode="contain"
                            />
                          )}
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: transport === o.val ? "700" : "400",
                              color: transport === o.val ? DC.text : DC.textDim,
                            }}
                          >
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* BUDŽET */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.budgetLabel")}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: DC.bg,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: DC.inputBorder,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: T.lead, color: DC.textDim }}>
                        €
                      </Text>
                      <TextInput
                        selectTextOnFocus
                        style={{
                          flex: 1,
                          fontSize: T.lead,
                          fontWeight: "600",
                          color: DC.text,
                          padding: 0,
                        }}
                        placeholder={t("plan.budgetPlaceholder")}
                        placeholderTextColor={DC.textDim}
                        value={budget}
                        onChangeText={(v) =>
                          setBudget(v.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="numeric"
                        maxLength={6}
                      />
                      <Text style={{ fontSize: T.meta, color: DC.textDim }}>
                        EUR
                      </Text>
                    </View>
                  </View>

                  {/* RADIJUS */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.radiusLabel")}
                    </Text>
                    <View
                      style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                    >
                      {[2, 5, 10, 20].map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor:
                              activityRadius === r ? DC.cardHover : DC.bg,
                            borderWidth: 1,
                            borderColor:
                              activityRadius === r ? DC.border : DC.borderDim,
                          }}
                          onPress={() =>
                            setActivityRadius((prev) => (prev === r ? null : r))
                          }
                        >
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: activityRadius === r ? "700" : "400",
                              color:
                                activityRadius === r ? DC.text : DC.textDim,
                            }}
                          >
                            {r} km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* INTERESI */}
                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: "700",
                          color: DC.textSub,
                        }}
                      >
                        {t("plan.interestsLabel")}
                      </Text>
                      {interests.length > 0 && (
                        <TouchableOpacity onPress={() => setInterests([])}>
                          <Text
                            style={{
                              fontSize: T.meta,
                              color: DC.accent,
                              fontWeight: "600",
                            }}
                          >
                            {t("plan.clearInterestsBtn")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <InterestiGrid
                      interests={interests}
                      onToggle={handleToggleInterest}
                      DC={DC}
                      t={t}
                    />
                  </View>
                </View>
              )}

              {/* GUMB GENERIRAJ */}
              <TouchableOpacity
                style={{
                  margin: 16,
                  marginTop: 24,
                  backgroundColor: DC.cardHover,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: DC.border,
                  paddingVertical: 18,
                  alignItems: "center",
                }}
                onPress={generate}
              >
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.lead,
                    fontWeight: "800",
                  }}
                >
                  {spontaneous ? t("plan.discoverBtn") : t("plan.generateBtn")}
                </Text>
                <Text
                  style={{ color: DC.textDim, fontSize: T.meta, marginTop: 4 }}
                >
                  {t("plan.generateSubtitle")}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ========== REZULTAT ========== */}
        {step === "result" && (
          <ScrollView
            ref={pageScrollRef}
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            {/* Što su drugi objavili u ovom gradu — plan govori kamo ići,
                ovo pokazuje kako to izgleda i što se sprema. */}
            {geocodedCoords && (
              <TouchableOpacity
                style={{
                  marginHorizontal: 16,
                  marginTop: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                  backgroundColor: DC.card,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
                onPress={() => setAreaSheetOpen(true)}
              >
                <Text style={{ fontSize: T.title }}>📣</Text>
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.body,
                    fontWeight: "700",
                  }}
                >
                  {t("area.openFromPlan")}
                </Text>
              </TouchableOpacity>
            )}
            {/* KARTA */}

            {/* PRE-LOAD IKONA — skriveni View koji inicijalizira sve Image komponente */}
            <View
              style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
            >
              {Object.entries(MARKER_IMAGES).map(([key, src]) => (
                <Image key={key} source={src} style={{ width: 1, height: 1 }} />
              ))}
            </View>
            {geocodedCoords && activeDayActivities.length > 0 && (
              <>
                {/* SELEKTOR DANA (samo ako više od 1 dana) */}
                {generatedNumDays > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 12, paddingHorizontal: 16 }}
                    contentContainerStyle={{ gap: 6, paddingRight: 32 }}
                  >
                    {Array.from({
                      length: Math.min(generatedNumDays, 7),
                    }).map((_, i) => (
                      <TouchableOpacity
                        key={i}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor:
                            activeDay === i
                              ? ROUTE_COLORS[i % ROUTE_COLORS.length]
                              : DC.bg,
                          borderWidth: 1.5,
                          borderColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                        }}
                        onPress={() => setActiveDay(i)}
                      >
                        <Text
                          style={{
                            fontSize: T.meta,
                            fontWeight: "700",
                            color:
                              activeDay === i
                                ? "#fff"
                                : ROUTE_COLORS[i % ROUTE_COLORS.length],
                          }}
                        >
                          {t("plan.dayLabel2", { day: i + 1 })}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* KARTA */}
                <View
                  style={{
                    marginHorizontal: 16,
                    marginTop: 12,
                    borderRadius: 16,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: DC.borderDim,
                  }}
                >
                  <MapView
                    ref={mapRef}
                    style={{ height: 320 }}
                    initialRegion={{
                      latitude:
                        activeDayActivities[0]?.venue?.latitude ??
                        geocodedCoords.latitude,
                      longitude:
                        activeDayActivities[0]?.venue?.longitude ??
                        geocodedCoords.longitude,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }}
                    onMapReady={() => setMapReady(true)}
                    customMapStyle={PLAN_MAP_STYLE}
                    toolbarEnabled={false}
                    moveOnMarkerPress={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    showsCompass={false}
                    showsPointsOfInterests={false}
                  >
                    {(() => {
                      const routeColor =
                        ROUTE_COLORS[activeDay % ROUTE_COLORS.length];
                      const stopCoords = activeDayActivities
                        .filter((a) => a.venue)
                        .map((a) => ({
                          latitude: a.venue!.latitude,
                          longitude: a.venue!.longitude,
                        }));
                      const showToMe =
                        !!userLocation &&
                        !!focusTarget &&
                        haversineKm(
                          userLocation.latitude,
                          userLocation.longitude,
                          focusTarget.latitude,
                          focusTarget.longitude,
                        ) <= FAR_KM;

                      return (
                        <>
                          {/* Redoslijed postaja: tanka puna crta. */}
                          {stopCoords.length > 1 && (
                            <Polyline
                              coordinates={stopCoords}
                              strokeColor={routeColor + "99"}
                              strokeWidth={3}
                            />
                          )}
                          {/* Od mene do odabranog mjesta: isprekidana plava. */}
                          {showToMe && userLocation && focusTarget && (
                            <Polyline
                              coordinates={[userLocation, focusTarget]}
                              strokeColor="#1e88e5"
                              strokeWidth={4}
                              lineDashPattern={[10, 8]}
                            />
                          )}
                          {userLocation && (
                            <UserMarker coordinate={userLocation} />
                          )}
                          {activeDayActivities.map((activity, idx) => (
                            <SimpleMarker
                              key={`marker_${idx}`}
                              activity={activity}
                              color={
                                placeCategories[
                                  activity.venueType as keyof typeof placeCategories
                                ]?.color ?? routeColor
                              }
                              isActive={
                                !previewVenue &&
                                activeStop === idx &&
                                activity.venue !== null
                              }
                              isCompleted={completedStops.has(idx)}
                              onPress={() => {
                                if (activity.venue) selectStop(idx);
                              }}
                            />
                          ))}
                        </>
                      );
                    })()}

                    {/* Mjesto koje korisnik upravo razgledava iz popisa. */}
                    {previewVenue && (
                      <Marker
                        coordinate={{
                          latitude: previewVenue.latitude,
                          longitude: previewVenue.longitude,
                        }}
                        title={previewVenue.name}
                        description={previewVenue.address}
                        pinColor="#f2c14e"
                        zIndex={10}
                      />
                    )}
                  </MapView>

                  {/* Prečaci za kameru */}
                  <View
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      gap: 8,
                      alignItems: "flex-end",
                    }}
                  >
                    {userLocation && focusTarget && (
                      <TouchableOpacity
                        onPress={() => focusOn(focusTarget)}
                        style={mapPill(isDark)}
                        accessibilityRole="button"
                        accessibilityLabel={t("plan.showMeAndStop")}
                      >
                        <Text style={mapPillText(isDark)}>◎</Text>
                      </TouchableOpacity>
                    )}
                    {activeDayActivities.length > 1 && (
                      <TouchableOpacity
                        onPress={fitWholeDay}
                        style={mapPill(isDark)}
                        accessibilityRole="button"
                        accessibilityLabel={t("plan.showAllStops")}
                      >
                        <Text style={mapPillText(isDark)}>⤢</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {renderStopCard()}
                {renderTimeline()}
              </>
            )}

            {/* MJESTA PO KATEGORIJAMA */}
            {Object.keys(allVenues).length > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 10,
                  }}
                >
                  {t("plan.allFoundPlaces")} (
                  {Object.values(allVenues).reduce(
                    (n, list) => n + list.length,
                    0,
                  )}
                  )
                </Text>
                {Object.entries(allVenues).map(([type, options]) => {
                  const cat =
                    placeCategories[type as keyof typeof placeCategories];
                  const color = cat?.color || "#667eea";
                  const visitedCount = options.filter((v) =>
                    isVenueVisited(v, type),
                  ).length;
                  const isOpen = expandedCategories.has(type);

                  return (
                    <View
                      key={type}
                      style={{
                        backgroundColor: DC.card,
                        borderRadius: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: DC.borderDim,
                        overflow: "hidden",
                      }}
                    >
                      <TouchableOpacity
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 12,
                          gap: 10,
                          backgroundColor: color + "15",
                        }}
                        onPress={() =>
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            next.has(type) ? next.delete(type) : next.add(type);
                            return next;
                          })
                        }
                      >
                        {MARKER_IMAGES[type] ? (
                          <Image
                            source={MARKER_IMAGES[type]}
                            style={{ width: 40, height: 40 }}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={{ fontSize: T.screen }}>
                            {EMOJIS[type] || "📍"}
                          </Text>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: "700",
                              color: DC.text,
                            }}
                          >
                            {t(`categories.${type}`, { defaultValue: type })}
                          </Text>
                          <Text
                            style={{ fontSize: T.caption, color: DC.textDim }}
                          >
                            {options.length} {t("plan.placesWord")}
                            {visitedCount > 0
                              ? ` · ✓ ${visitedCount} ${t("plan.visitedWord")}`
                              : ""}
                          </Text>
                        </View>
                        <Text
                          style={{ fontSize: T.meta, color, fontWeight: "700" }}
                        >
                          {isOpen ? "▲" : "▼"}
                        </Text>
                      </TouchableOpacity>

                      {isOpen &&
                        options.map((venue, idx) => {
                          const visited = isVenueVisited(venue, type);
                          const dist = geocodedCoords
                            ? haversineKm(
                                geocodedCoords.latitude,
                                geocodedCoords.longitude,
                                venue.latitude,
                                venue.longitude,
                              )
                            : null;
                          return (
                            <View
                              key={idx}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                padding: 12,
                                borderTopWidth: 1,
                                borderTopColor: DC.borderDim,
                                gap: 10,
                                backgroundColor: visited
                                  ? "#34c75908"
                                  : "transparent",
                              }}
                            >
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 13,
                                  backgroundColor: visited
                                    ? "#34c75922"
                                    : color + "22",
                                  borderWidth: 1,
                                  borderColor: visited ? "#34c759" : color,
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "800",
                                    color: visited ? "#34c759" : color,
                                  }}
                                >
                                  {visited ? "✓" : idx + 1}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={{ flex: 1 }}
                                // Dugi pritisak otvara pune detalje mjesta.
                                onLongPress={() => {
                                  setSelectedPlace({
                                    id: `plan_${type}_${venue.name}`,
                                    name: venue.name,
                                    latitude: venue.latitude,
                                    longitude: venue.longitude,
                                    type: type as Place["type"],
                                    address: venue.address,
                                  });
                                  setShowDetailModal(true);
                                }}
                                // Dodir pokazuje mjesto na karti, jer je prvo
                                // pitanje uvijek "gdje je to u odnosu na mene".
                                onPress={() =>
                                  showVenueOnMap({
                                    name: venue.name,
                                    latitude: venue.latitude,
                                    longitude: venue.longitude,
                                    address: venue.address,
                                    type,
                                  })
                                }
                              >
                                <Text
                                  style={{
                                    fontSize: T.meta,
                                    fontWeight: "700",
                                    color: visited ? "#34c759" : DC.text,
                                  }}
                                  numberOfLines={1}
                                >
                                  {venue.name}
                                </Text>
                                {venue.address && (
                                  <Text
                                    style={{
                                      fontSize: T.caption,
                                      color: DC.textDim,
                                      marginTop: 1,
                                    }}
                                    numberOfLines={1}
                                  >
                                    📍 {venue.address}
                                  </Text>
                                )}
                                {dist !== null && (
                                  <Text
                                    style={{
                                      fontSize: T.caption,
                                      color: dist < 1 ? "#34c759" : color,
                                      marginTop: 1,
                                    }}
                                  >
                                    {dist < 1
                                      ? `${Math.round(dist * 1000)} m`
                                      : `${dist.toFixed(1)} km`}
                                  </Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 7,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: visited ? "#34c759" : color,
                                  backgroundColor: visited
                                    ? "#34c75922"
                                    : color + "18",
                                }}
                                onPress={() => handleMarkVisited(venue, type)}
                                disabled={visited}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "700",
                                    color: visited ? "#34c759" : color,
                                  }}
                                >
                                  {visited
                                    ? t("plan.visited2")
                                    : t("plan.markPlace")}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                    </View>
                  );
                })}
              </View>
            )}

            {/* AKCIJE */}
            <View style={{ marginHorizontal: 16, gap: 10, marginBottom: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: DC.cardHover,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: DC.border,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
                onPress={() => Share.share({ message: result }).catch(() => {})}
              >
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.body,
                    fontWeight: "700",
                  }}
                >
                  {t("plan.sharePlan")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: DC.bg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
                onPress={() => setStep("form")}
              >
                <Text
                  style={{
                    color: DC.textSub,
                    fontSize: T.body,
                    fontWeight: "600",
                  }}
                >
                  {t("plan.newPlanBtn")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* OCJENA */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 16,
                marginBottom: 32,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.text,
                  marginBottom: 10,
                }}
              >
                {t("plan.rateTitle")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => !ratingSubmitted && setPlanRating(n)}
                    disabled={ratingSubmitted}
                  >
                    <Text
                      style={{
                        fontSize: T.hero,
                        color: planRating >= n ? "#f39c12" : DC.borderDim,
                      }}
                    >
                      {planRating >= n ? "★" : "☆"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Poruka o grešci */}
              {ratingError && (
                <Text
                  style={{
                    color: DC.danger,
                    fontSize: T.meta,
                    marginTop: 8,
                    textAlign: "center",
                  }}
                >
                  {ratingError}
                </Text>
              )}

              {/* Gumb za slanje — prikazuje se dok nije poslano */}
              {planRating > 0 && !ratingSubmitted && (
                <TouchableOpacity
                  style={{
                    marginTop: 10,
                    paddingHorizontal: 24,
                    paddingVertical: 10,
                    backgroundColor: ratingLoading
                      ? DC.borderDim
                      : DC.cardHover,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DC.border,
                    opacity: ratingLoading ? 0.7 : 1,
                  }}
                  onPress={submitRating}
                  disabled={ratingLoading}
                >
                  {ratingLoading ? (
                    <ActivityIndicator size="small" color={DC.text} />
                  ) : (
                    <Text style={{ color: DC.text, fontWeight: "700" }}>
                      {t("plan.rateSubmit")}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Potvrda nakon uspješnog slanja — bez Alert */}
              {ratingSubmitted && (
                <View
                  style={{
                    marginTop: 12,
                    alignItems: "center",
                    backgroundColor: "#34c75918",
                    borderRadius: 10,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: "#34c759",
                  }}
                >
                  <Text
                    style={{
                      color: "#34c759",
                      fontWeight: "700",
                      fontSize: T.body,
                    }}
                  >
                    ✓ {t("plan.rateThankYou")}
                  </Text>
                  <Text
                    style={{
                      color: DC.textDim,
                      fontSize: T.meta,
                      marginTop: 4,
                    }}
                  >
                    {destination} · {planRating}/5 ⭐
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* Objave oko grada za koji je plan napravljen. */}
        <AreaActivitiesSheet
          visible={areaSheetOpen}
          point={
            geocodedCoords
              ? {
                  name: destination || "",
                  latitude: geocodedCoords.latitude,
                  longitude: geocodedCoords.longitude,
                }
              : null
          }
          onClose={() => setAreaSheetOpen(false)}
        />

        {/* Place Detail Modal */}
        <PlaceDetailModalComponent
          place={selectedPlace}
          visible={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPlace(null);
          }}
          onMarkVisited={async (p: Place) => {
            if (onMarkVisited) await onMarkVisited(p);
            setLocalVisitedIds((prev) => new Set([...prev, p.id]));
            setShowDetailModal(false);
            setSelectedPlace(null);
          }}
          onHidePlace={() => {
            setShowDetailModal(false);
            setSelectedPlace(null);
          }}
          isVisited={
            selectedPlace
              ? localVisitedIds.has(selectedPlace.id) ||
                visits.some(
                  (v) =>
                    v.placeName.toLowerCase() ===
                      (selectedPlace.name || "").toLowerCase() &&
                    v.placeType === selectedPlace.type,
                )
              : false
          }
          notifPrefs={{
            appEnabled: false,
            emailEnabled: false,
            email: "",
            categories: [],
          }}
          onToggleNotif={() => {}}
        />
      </View>
    </Modal>
  );
}
