// components/AreaActivitiesSheet.tsx
//
// Što se događa oko nekog mjesta.
//
// Dosad se sadržaj vezan uz lokaciju mogao vidjeti samo kroz vlastiti feed —
// "blizu mene" mjeri od krajeva u kojima se korisnik inače kreće. Tko dođe u
// nepoznat grad, ili ga tek planira posjetiti, time nije dobivao ništa: bio je
// daleko od svih svojih krajeva.
//
// Ovdje se bira točka na karti (ili grad iz plana) i traži što je objavljeno
// oko nje. Poslužitelj radi isti filtar po udaljenosti kao i za feed, samo
// mjeri od zadane točke.
//
// Ista komponenta služi i karti i planiranju izleta, da se dva prikaza istog
// ne raziđu u dvije verzije.

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE_URL } from "@/app/config/api";
import { POST_CATEGORY_IDS } from "@/app/services/locationService";
import { APP_ICONS, getIcon } from "../constants/icons";
import { CloseButton } from "./CloseButton";
import { MediaPager, PagerItem } from "./MediaPager";
import { T } from "../styles/varaTheme";
import { getToken } from "@/utils/tokenStore";

/** Mjesto oko kojeg se traži. */
export interface AreaPoint {
  name: string;
  latitude: number;
  longitude: number;
}

interface AreaPost {
  id: number;
  title: string;
  filePath: string;
  mediaType?: string;
  thumbnailPath?: string | null;
  location?: string | null;
  additionalDescription?: string | null;
  categories?: string | null;
  isEvent?: boolean;
  eventStartAt?: string | null;
  userName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;

const labelStyle = {
  color: "#8aa483",
  fontSize: T.caption,
  fontWeight: "700" as const,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  paddingHorizontal: 18,
  paddingTop: 10,
  paddingBottom: 4,
};
const STORAGE_RADIUS = "vara_area_radius_v1";
const STORAGE_HINT = "vara_area_hint_seen_v1";

function fullUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function isImagePath(path?: string | null): boolean {
  const clean = (path || "").toLowerCase().split("?")[0];
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].some((e) =>
    clean.endsWith(e),
  );
}

/** "20.09.2026. - 12:00" — isti oblik kao drugdje u aplikaciji. */
function eventWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Zračna udaljenost u kilometrima. */
function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = (bLat - aLat) * 111;
  const dLon = (bLon - aLon) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Jedna objava u rezultatima: slika s oznakama, naslov, mjesto, kategorije. */
function AreaPostCard({
  item,
  km,
  placeName,
  onPress,
}: {
  item: AreaPost;
  km: number | null;
  placeName: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);
  const thumb = fullUrl(item.thumbnailPath || item.filePath);
  const isVideo = !(item.mediaType === "image" || isImagePath(item.filePath));
  const cats = (item.categories || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);
  // Bez slike (video bez sličice, pogreška učitavanja) nikad crna ploha:
  // zelena podloga s ikonom kategorije.
  const placeholderIcon = (cats[0] && getIcon(cats[0])) || APP_ICONS.navVideo;
  const showImage = !!thumb && !imgFailed;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("common.openPost")}
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#1b3a20",
        borderWidth: 1,
        borderColor: "#2f5a33",
      }}
    >
      <View style={{ height: 150, backgroundColor: "#24472a" }}>
        {showImage ? (
          <Image
            source={{ uri: thumb }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Image
              source={placeholderIcon}
              style={{ width: 72, height: 72, opacity: 0.9 }}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Tamna traka pri dnu slike da oznake ostanu čitljive */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 44,
            backgroundColor: "rgba(10,24,12,0.35)",
          }}
        />

        {item.isEvent && item.eventStartAt && (
          <View
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 12,
              backgroundColor: "#C9A227",
            }}
          >
            <Ionicons name="calendar-outline" size={13} color="#1A2E15" />
            <Text style={{ color: "#1A2E15", fontSize: 12, fontWeight: "800" }}>
              {eventWhen(item.eventStartAt)}
            </Text>
          </View>
        )}

        {isVideo && showImage && (
          <View
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "rgba(10,24,12,0.7)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="play" size={15} color="#fff" />
          </View>
        )}

        {km !== null && (
          <View
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: "rgba(10,24,12,0.78)",
            }}
          >
            <Ionicons name="navigate-outline" size={12} color="#cfe6c4" />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
              {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
              {/* Gola brojka ne kaže od čega se mjeri; uz ime mjesta je jasno. */}
              {placeName ? ` ${t("area.from", { place: placeName })}` : ""}
            </Text>
          </View>
        )}
      </View>

      <View style={{ padding: 12, gap: 6 }}>
        <Text
          style={{ color: "#fff", fontSize: T.lead, fontWeight: "800" }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {!!item.location && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="location-outline" size={14} color="#8aa483" />
            <Text
              style={{ flex: 1, color: "#b6cfae", fontSize: T.meta }}
              numberOfLines={1}
            >
              {item.location}
            </Text>
          </View>
        )}
        {cats.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {cats.map((id) => {
              const icon = getIcon(id);
              return (
                <View
                  key={id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingLeft: 3,
                    paddingRight: 9,
                    paddingVertical: 2,
                    borderRadius: 12,
                    backgroundColor: "#24472a",
                  }}
                >
                  {icon && (
                    <Image
                      source={icon}
                      style={{ width: 20, height: 20 }}
                      resizeMode="contain"
                    />
                  )}
                  <Text
                    style={{
                      color: "#cfe0c6",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {t(`categories.${id}`, { defaultValue: id })}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {!!item.userName && (
          <Text style={{ color: "#8aa483", fontSize: 12 }}>
            @{item.userName}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function AreaActivitiesSheet({
  visible,
  point,
  onClose,
}: {
  visible: boolean;
  point: AreaPoint | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [posts, setPosts] = useState<AreaPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pagerAt, setPagerAt] = useState<number | null>(null);
  // Objašnjenje što ova funkcija radi: pri prvom otvaranju je otvoreno, nakon
  // "Razumijem" se pamti i skuplja; ostaje dostupno preko gumba "?".
  const [showHint, setShowHint] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [catQuery, setCatQuery] = useState("");
  /**
   * Naziv mjesta za naslov.
   *
   * Kad se do ovog prikaza dođe pomicanjem karte, a ne pretragom, imamo samo
   * koordinate — a "Ovaj kraj" korisniku ne znači ništa. Obrnutim
   * geokodiranjem dobijemo ime grada, pa naslov kaže ZA ŠTO su objave.
   */
  const [placeName, setPlaceName] = useState<string>("");

  useEffect(() => {
    if (!visible || !point) return;
    if (point.name) {
      setPlaceName(point.name);
      return;
    }
    let alive = true;
    Location.reverseGeocodeAsync({
      latitude: point.latitude,
      longitude: point.longitude,
    })
      .then((hits) => {
        if (!alive) return;
        const first = hits?.[0];
        setPlaceName(first?.city || first?.subregion || first?.region || "");
      })
      .catch(() => {
        // Geokoder zna zakazati (bez mreže, bez Google Play usluga). Naslov
        // tada ostaje bez imena umjesto da prikaz padne.
      });
    return () => {
      alive = false;
    };
  }, [visible, point]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_RADIUS)
      .then((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) setRadiusKm(Math.min(n, 100));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_HINT)
      .then((v) => setShowHint(v !== "1"))
      .catch(() => setShowHint(true));
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    AsyncStorage.setItem(STORAGE_HINT, "1").catch(() => {});
  };

  const load = useCallback(async () => {
    if (!point) return;
    setLoading(true);
    setFailed(false);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/video?page=1&pageSize=50` +
          `&radiusKm=${radiusKm}&lat=${point.latitude}&lon=${point.longitude}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [point, radiusKm]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const chooseRadius = (km: number) => {
    setRadiusKm(km);
    AsyncStorage.setItem(STORAGE_RADIUS, String(km)).catch(() => {});
  };

  const toggleCat = (id: string) =>
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  /** Udaljenost objave od tražene točke, ili null kad objava nema položaj. */
  const postDistance = (p: AreaPost): number | null =>
    point && p.latitude != null && p.longitude != null
      ? distanceKm(point.latitude, point.longitude, p.latitude, p.longitude)
      : null;

  // Dvostruki filtar, namjerno.
  //
  // Po udaljenosti filtrira i poslužitelj, ali dok nova verzija ne bude
  // postavljena, stara jednostavno zanemari nepoznate parametre lat/lon i
  // vrati SVE objave — a one se onda ovdje prikažu kao da su u blizini
  // (Velebit na 224 km pod dometom od 25 km). Bolje prikazati manje nego
  // netočno.
  //
  // Objave bez koordinata ispadaju iz prikaza: za njih se ne može tvrditi da
  // su u ovom kraju.
  const shown = posts.filter((p) => {
    const km = postDistance(p);
    if (km === null || km > radiusKm) return false;
    if (!selectedCats.length) return true;
    return (p.categories || "")
      .split(",")
      .map((c) => c.trim())
      .some((c) => selectedCats.includes(c));
  });

  const pagerItems: PagerItem[] = shown.map((p) => ({
    id: p.id,
    url: fullUrl(p.filePath),
    isVideo: !(p.mediaType === "image" || isImagePath(p.filePath)),
    title: p.title,
    location: p.location,
    description: p.additionalDescription,
    isEvent: p.isEvent,
    eventStartAt: p.eventStartAt,
    authorName: p.userName ? `@${p.userName}` : undefined,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
        onPress={onClose}
      >
        <View style={{ flex: 1 }} />
        <Pressable
          style={{
            height: "85%",
            backgroundColor: "#16301a",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: "#2f5a33",
          }}
          onPress={() => {}}
        >
          <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                {/* Naslov nosi ime mjesta; zasebni podnaslov ("Ovaj kraj")
                    nije govorio ništa što se iz karte već ne vidi. */}
                <Text
                  style={{ color: "#fff", fontSize: T.lead, fontWeight: "800" }}
                  numberOfLines={2}
                >
                  {placeName
                    ? t("area.titleFor", { place: placeName })
                    : t("area.title")}
                </Text>
              </View>
              {!showHint && (
                <TouchableOpacity
                  onPress={() => setShowHint(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("area.helpLabel")}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    borderWidth: 1.5,
                    borderColor: "#5a8a48",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "#cfe6c4",
                      fontSize: T.body,
                      fontWeight: "800",
                    }}
                  >
                    ?
                  </Text>
                </TouchableOpacity>
              )}
              <CloseButton onPress={onClose} tone="light" />
            </View>

            <FlatList
              data={loading ? [] : shown}
              keyExtractor={(p) => String(p.id)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 32 }}
              ListHeaderComponent={
                <View>
                  {showHint && (
                    <View
                      style={{
                        marginHorizontal: 16,
                        marginBottom: 6,
                        padding: 12,
                        borderRadius: 14,
                        backgroundColor: "#1f4024",
                        borderWidth: 1,
                        borderColor: "#5a8a48",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <Image
                          source={APP_ICONS.mapActivities}
                          style={{ width: 44, height: 44 }}
                          resizeMode="contain"
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: T.body,
                              fontWeight: "800",
                            }}
                          >
                            {t("area.hintTitle")}
                          </Text>
                          <Text
                            style={{
                              color: "#cfe0c6",
                              fontSize: T.meta,
                              lineHeight: 18,
                              marginTop: 2,
                            }}
                          >
                            {t("area.hintBody")}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={dismissHint}
                        style={{
                          alignSelf: "flex-end",
                          marginTop: 8,
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: "#5a8a48",
                        }}
                        accessibilityRole="button"
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: T.meta,
                            fontWeight: "700",
                          }}
                        >
                          {t("area.hintOk")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Domet — pet jednako širokih polja u jednom retku. */}
                  <Text style={labelStyle}>{t("area.rangeLabel")}</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      paddingHorizontal: 16,
                    }}
                  >
                    {RADIUS_OPTIONS.map((km) => {
                      const on = km === radiusKm;
                      return (
                        <TouchableOpacity
                          key={km}
                          onPress={() => chooseRadius(km)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={{
                            flex: 1,
                            paddingVertical: 9,
                            alignItems: "center",
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: on ? "#8fd06a" : "#2f5a33",
                            backgroundColor: on ? "#5a8a48" : "#1b3a20",
                          }}
                        >
                          <Text
                            style={{
                              color: on ? "#fff" : "#b6cfae",
                              fontSize: T.meta,
                              fontWeight: "800",
                            }}
                          >
                            {km} km
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Kategorije — zatvorene zauzimaju jedan redak, otvorene imaju
                pretragu i mrežu s ikonama; više nema vodoravnog listanja. */}
                  <TouchableOpacity
                    onPress={() => setShowCats((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showCats }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginHorizontal: 16,
                      marginTop: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: "#1b3a20",
                      borderWidth: 1.5,
                      borderColor: selectedCats.length ? "#c9a227" : "#2f5a33",
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text
                        style={{
                          color: "#8aa483",
                          fontSize: T.caption,
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {t("area.categoriesLabel")}
                      </Text>
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: T.body,
                          fontWeight: "700",
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {selectedCats.length === 0
                          ? t("area.allCategories")
                          : selectedCats
                              .map((id) =>
                                t(`categories.${id}`, { defaultValue: id }),
                              )
                              .join(", ")}
                      </Text>
                    </View>
                    <Ionicons
                      name={showCats ? "chevron-up" : "chevron-down"}
                      size={22}
                      color="#cfe6c4"
                    />
                  </TouchableOpacity>

                  {showCats && (
                    <View style={{ marginHorizontal: 16, marginTop: 8 }}>
                      <TextInput
                        selectTextOnFocus
                        value={catQuery}
                        onChangeText={setCatQuery}
                        placeholder={t("area.searchCategories")}
                        placeholderTextColor="#7d9a76"
                        autoCorrect={false}
                        autoCapitalize="none"
                        clearButtonMode="while-editing"
                        style={{
                          backgroundColor: "#0f2412",
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#2f5a33",
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          color: "#fff",
                          fontSize: T.body,
                          marginBottom: 8,
                        }}
                      />
                      <View>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          {POST_CATEGORY_IDS.filter((id) => {
                            const q = catQuery
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase()
                              .trim();
                            if (!q) return true;
                            return t(`categories.${id}`, { defaultValue: id })
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase()
                              .includes(q);
                          }).map((id) => {
                            const on = selectedCats.includes(id);
                            const icon = getIcon(id);
                            return (
                              <TouchableOpacity
                                key={id}
                                onPress={() => toggleCat(id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                  paddingLeft: 4,
                                  paddingRight: 10,
                                  paddingVertical: 4,
                                  borderRadius: 16,
                                  borderWidth: 1.5,
                                  borderColor: on ? "#c9a227" : "#2f5a33",
                                  backgroundColor: on ? "#c9a22733" : "#1b3a20",
                                }}
                              >
                                {icon && (
                                  <Image
                                    source={icon}
                                    style={{ width: 28, height: 28 }}
                                    resizeMode="contain"
                                  />
                                )}
                                <Text
                                  style={{
                                    color: on ? "#f2d78a" : "#b6cfae",
                                    fontSize: T.meta,
                                    fontWeight: "600",
                                  }}
                                >
                                  {t(`categories.${id}`, { defaultValue: id })}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      {selectedCats.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setSelectedCats([])}
                          style={{
                            alignSelf: "flex-start",
                            paddingVertical: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: "#f2d78a",
                              fontSize: T.meta,
                              fontWeight: "700",
                            }}
                          >
                            {t("area.clearCats")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {!loading && (
                    <Text
                      style={{
                        color: "#8aa483",
                        fontSize: T.meta,
                        paddingHorizontal: 18,
                        paddingTop: 10,
                      }}
                    >
                      {t("area.resultsCount", { count: shown.length })}
                    </Text>
                  )}
                </View>
              }
              ListEmptyComponent={
                loading ? (
                  <ActivityIndicator
                    style={{ marginTop: 40 }}
                    color="#8fd06a"
                  />
                ) : (
                  <View style={{ alignItems: "center", marginTop: 40 }}>
                    <Ionicons
                      name={failed ? "cloud-offline-outline" : "map-outline"}
                      size={44}
                      color="#2f5a33"
                    />
                    <Text
                      style={{
                        color: "#b6cfae",
                        fontSize: T.body,
                        marginTop: 12,
                        textAlign: "center",
                        paddingHorizontal: 24,
                        lineHeight: 20,
                      }}
                    >
                      {failed ? t("area.loadFailed") : t("area.empty")}
                    </Text>
                  </View>
                )
              }
              renderItem={({ item, index }) => (
                <AreaPostCard
                  item={item}
                  km={postDistance(item)}
                  placeName={placeName}
                  onPress={() => setPagerAt(index)}
                />
              )}
            />
          </SafeAreaView>
        </Pressable>
      </Pressable>

      <MediaPager
        visible={pagerAt !== null}
        items={pagerItems}
        initialIndex={pagerAt ?? 0}
        onClose={() => setPagerAt(null)}
      />
    </Modal>
  );
}
