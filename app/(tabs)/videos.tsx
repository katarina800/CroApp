// app/videos.tsx — VARA tema, usklađena s dashboard.tsx
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AppState,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { looksLikeEvent } from "../../utils/eventHints";
import {
  getNotificationPreferences,
  saveFailureDetail,
  saveFailureMessageKey,
  saveNotificationPreferences,
} from "../../utils/notificationsApi";
import { createVideoThumbnail } from "../../utils/videoThumbnail";
import { StoryBadge } from "../../app/StoryBadge";
import { useTheme } from "../../components/AdaptiveThemeProvider";
import { API_BASE_URL } from "../config/api";
import { CloseButton } from "@/components/CloseButton";
import {
  useInputBottomOffset,
  useKeyboardHeight,
} from "@/hooks/use-keyboard-offset";
import {
  POST_CATEGORY_IDS,
  inferAgeGroupsForCategory,
  inferCategoryFromLocationName,
  inferCategoryFromOsmTag,
} from "../services/locationService";

const { width } = Dimensions.get("window");

/** Zapamćeni izbor prikaza feeda ("blizu mene" / "svugdje"). */
const STORAGE_FEED_SCOPE = "vara_feed_scope_v1";
const STORAGE_FEED_RADIUS = "vara_feed_radius_v1";

/**
 * Ponuđeni rasponi za "blizu mene", u kilometrima.
 *
 * Dosad je "blizu" značilo fiksnih 50 km, što je za nekoga tko traži kavu u
 * gradu predaleko, a za planinara preblizu. Gornja granica je 100 km — dalje
 * od toga "blizu" prestaje išta značiti, a za to postoji "Svugdje".
 */
const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
const DEFAULT_RADIUS_KM = 50;
const AGE_GROUP_IDS = [
  "minors",
  "youth",
  "students",
  "adults",
  "retired",
] as const;

// ─── VARA Paleta — identična dashboard.tsx / varaTheme.ts ────────────────────
// Ovdje je stajala jos jedna kopija palete — cetvrta u aplikaciji, i vec
// zaostala: imala je stari danger (#8B3030, omjer 1.77) i stari silverDim.
// Sada dolazi iz sustava boja, pa se ispravci vide i ovdje.
import { T, V } from "../../styles/varaTheme";
import { StateView } from "../../components/StateView";
import { getToken } from "@/utils/tokenStore";

function getVT(dark: boolean) {
  return {
    bg: dark ? "#1A2E15" : "#f0ede4",
    bgCard: dark ? "#243B1E" : "#e4ead8",
    bgLight: dark ? "#2D5518" : "#ccdcb8",
    border: dark ? "#304A28" : "#c0d0a8",
    borderBright: dark ? "#4A7040" : "#5a8a40",
    textPrimary: dark ? "#E8EDE4" : "#1a2a18",
    textSecondary: dark ? "#C4CABC" : "#3a4a35",
    textMuted: dark ? "#8A9486" : "#5a6a55",
    accent: dark ? "#5A8A48" : "#3a6a28",
    accentGold: "#B8A060",
    inputBg: dark ? "#243B1E" : "#e4ead8",
    placeholder: dark ? "#8A9486" : "#7a8a75",
    danger: dark ? "#8B3030" : "#7a2020",
    overlay: "rgba(10,20,8,0.88)",
  } as const;
}

interface VideoItem {
  id: number;
  title: string;
  additionalDescription: string;
  location: string;
  filePath: string;
  userId: number;
  createdAt: string;
  userName?: string;
  userAvatar?: string | null;
  // Ime i prezime autora stižu zajedno s videom (novi backend), pa avatar i
  // inicijali ne traže dodatni zahtjev po stavci feeda.
  userFirstName?: string;
  userLastName?: string;
  likeCount?: number;
  commentCount?: number;
  isLiked?: boolean;
  isSaved?: boolean;
  isOwner?: boolean;
  isInWishlist?: boolean;
  mediaType?: string;
  /** Stabilne oznake kategorija objave ("cafe,club"). */
  categories?: string | null;
  isEvent?: boolean;
  eventStartAt?: string | null;
  thumbnailPath?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Nakon spremanja objave ponudi praćenje njezine kategorije — jednim
 * dodirom, ali IZRIJEKOM.
 *
 * Namjerno se ne uključuje samo od sebe: tiha promjena postavki obavijesti
 * zato što je netko nešto spremio je iznenađenje, a korisnik kasnije ne bi
 * povezao nove obavijesti s tim dodirom.
 */
async function offerCategoryFollow(
  video: { categories?: string | null },
  t: (k: string, o?: any) => string,
) {
  const categories = (video.categories || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const savedTitle = t("videos.savedToBoxTitle");

  if (categories.length === 0) {
    Alert.alert(savedTitle, t("videos.savedToBoxDesc"));
    return;
  }

  const prefs = await getNotificationPreferences();
  if (!prefs) {
    Alert.alert(savedTitle, t("videos.savedToBoxDesc"));
    return;
  }

  const missing = categories.find((c) => !prefs.categories.includes(c));
  if (!missing) {
    // Već prati sve kategorije ove objave — nema što ponuditi.
    Alert.alert(savedTitle, t("videos.savedToBoxDesc"));
    return;
  }

  const label = t(`categories.${missing}`, { defaultValue: missing });
  Alert.alert(savedTitle, t("notif.followCategoryAsk", { category: label }), [
    { text: t("common.no"), style: "cancel" },
    {
      text: t("notif.followCategoryYes"),
      onPress: async () => {
        const result = await saveNotificationPreferences({
          ...prefs,
          // Praćenje kategorije nema smisla ako su obavijesti isključene —
          // uključi ih zajedno s njom, jer je korisnik upravo to zatražio.
          appEnabled: true,
          categories: [...prefs.categories, missing],
        });
        Alert.alert(
          result.ok ? t("common.success") : t("common.error"),
          result.ok
            ? t("notif.followCategoryDone", { category: label })
            : t(saveFailureMessageKey(result.reason)) +
                saveFailureDetail(result),
        );
      },
    },
  ]);
}

/**
 * "danas 21:00", "sutra 19:30", "za 3 d", ili datum kad je dalje od tjedan
 * dana. Kratko jer stoji na kartici preko videa, gdje nema mjesta.
 */
/**
 * "20.09.2026. - 12:00".
 *
 * Prije je pisalo "danas", "sutra" ili "za 6 d" — kratko, ali za najavu
 * događaja beskorisno: tko planira izlet treba znati datum, a ne koliko je
 * dana ostalo od trenutka kad gleda. Uvijek isti oblik znači i da se dva
 * događaja mogu usporediti na prvi pogled.
 *
 * Dvoznamenkasti dan i mjesec, četveroznamenkasta godina i 24-satno vrijeme
 * su namjerno fiksni, a ne prepušteni postavkama uređaja — inače bi isti
 * događaj na jednom telefonu pisao "9/20/26, 12:00 PM", a na drugom
 * "20.09.2026.".
 */
function formatEventStart(iso: string) {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(start.getDate())}.${pad(start.getMonth() + 1)}.${start.getFullYear()}.`;
  const time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;

  return `${date} - ${time}`;
}

// ─── Helper: avatar URL ────────────────────────────────────────────────────────
function buildAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("http://") || avatar.startsWith("https://"))
    return avatar;
  return `${API_BASE_URL}${avatar.startsWith("/") ? avatar : `/${avatar}`}`;
}

interface FetchedProfile {
  url: string | null;
  firstName?: string;
  lastName?: string;
  username?: string;
}

// ✅ FIX: prije se ovdje dohvaćao SAMO avatar, a inicijali (fallback kad
// avatar ne postoji) ovisili su isključivo o firstName/lastName/username
// propovima koje POZIVATELJ mora ručno proslijediti — na dva od tri mjesta
// gdje se FreshAvatar koristi (glavni feed videa, primatelj u porukama) to
// se nije radilo, pa je fallback uvijek padao na golo "?" umjesto pravih
// inicijala, iako je ime korisnika ionako već dostupno na profilu koji se
// tu i onako dohvaća radi avatara. Sad se ime dohvaća ISTIM pozivom.
// userId === null znači "pozivatelj već ima podatke" — tada se ne šalje
// nikakav zahtjev.
// Predmemorija po korisniku, zajednička za sve prikaze avatara u ovom
// ekranu. Bez nje je svaki red koji nema avatar u svojim podacima slao
// vlastiti zahtjev — u komentarima i u dijeljenju to je znalo biti
// desetak istovremenih poziva za istog korisnika, a rate limiter na
// poslužitelju (429) ih je tiho odbijao pa je avatar ostajao na
// inicijalima. inFlight spaja istovremene zahtjeve u jedan.
const profileCache = new Map<number, FetchedProfile>();
const profileInFlight = new Map<number, Promise<FetchedProfile | null>>();

async function fetchUserProfile(
  userId: number,
): Promise<FetchedProfile | null> {
  const cached = profileCache.get(userId);
  if (cached) return cached;

  const pending = profileInFlight.get(userId);
  if (pending) return pending;

  const request = (async (): Promise<FetchedProfile | null> => {
    try {
      const token = await getToken();
      if (!token) return null;

      const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;

      const data = await res.json();
      const raw =
        data.Avatar ||
        data.avatar ||
        data.avatarUrl ||
        data.profileImage ||
        null;

      let url: string | null = null;
      if (raw) {
        // Namjerno bez "?uid=Date.now()": takav dodatak je tjerao ponovno
        // preuzimanje slike na svaki prikaz, pa je u listi koja reciklira
        // retke avatar stalno treptao. Kad se avatar doista promijeni,
        // promijeni se i njegov URL (nova datoteka u pohrani).
        url = raw.startsWith("avatar:")
          ? raw
          : raw.startsWith("http")
            ? raw
            : `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
      }

      const profile: FetchedProfile = {
        url,
        firstName: data.firstName || data.FirstName,
        lastName: data.lastName || data.LastName,
        username: data.username || data.Username,
      };
      profileCache.set(userId, profile);
      return profile;
    } catch {
      // Neuspjeh se ne pamti — sljedeći prikaz smije pokušati ponovno.
      return null;
    } finally {
      profileInFlight.delete(userId);
    }
  })();

  profileInFlight.set(userId, request);
  return request;
}

// ✅ FIX: prije se ovdje dohvaćao SAMO avatar, a inicijali (fallback kad
// avatar ne postoji) ovisili su isključivo o firstName/lastName/username
// propovima koje POZIVATELJ mora ručno proslijediti — na dva od tri mjesta
// gdje se FreshAvatar koristi (glavni feed videa, primatelj u porukama) to
// se nije radilo, pa je fallback uvijek padao na golo "?" umjesto pravih
// inicijala, iako je ime korisnika ionako već dostupno na profilu koji se
// tu i onako dohvaća radi avatara. Sad se ime dohvaća ISTIM pozivom.
// userId === null znači "pozivatelj već ima podatke" — tada se ne šalje
// nikakav zahtjev.
function useUserProfile(userId: number | null): FetchedProfile {
  const [profile, setProfile] = useState<FetchedProfile>(() =>
    userId === null
      ? { url: null }
      : (profileCache.get(userId) ?? { url: null }),
  );

  useEffect(() => {
    if (userId === null) return;

    const cached = profileCache.get(userId);
    if (cached) {
      setProfile(cached);
      return;
    }

    let alive = true;
    fetchUserProfile(userId).then((fetched) => {
      if (alive && fetched) setProfile(fetched);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  return profile;
}

const PRESET_AVATARS_VID: Record<string, any> = {
  "avatar:male": require("../../assets/images/avatar-male.png"),
  "avatar:female": require("../../assets/images/avatar-female.png"),
};

function FreshAvatar({
  userId,
  firstName,
  lastName,
  username,
  avatar,
  size,
}: {
  userId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  /** Avatar koji je već stigao uz podatke (npr. uz video u feedu). Ako je
   *  zadan, profil se NE dohvaća posebnim zahtjevom. */
  avatar?: string | null;
  size: number;
}) {
  // Profil se dohvaća samo kad avatar NIJE stigao zajedno s podacima.
  //
  // Prije se preskakalo čim bi stiglo ime ili korisničko ime, pa je autor
  // videa u feedu prikazivan inicijalima ("KZ") iako ima sliku: feed vraća
  // korisničko ime, dohvat se zbog toga preskočio, a slike u odgovoru nije
  // bilo — dok je ista osoba u pretrazi imala urednu sliku. Isto se događalo
  // u popisu korisnika kod slanja poruke, koji avatar uopće ne prosljeđuje.
  //
  // Uvjet je sada vezan uz ono što se doista prikazuje: ako avatar imamo,
  // mrežnog poziva nema (i dalje nema po jednog zahtjeva za svaki video);
  // ako ga nemamo, dohvaćamo ga umjesto da odmah odustanemo na inicijale.
  const hasInlineAvatar =
    avatar !== undefined && avatar !== null && avatar !== "";
  const profile = useUserProfile(hasInlineAvatar ? null : userId);
  const [failed, setFailed] = useState(false);
  // Preset avatari ("avatar:male"/"avatar:female") nisu URL-ovi — prosljeđuju
  // se takvi kakvi jesu jer se ispod mapiraju na ugrađene slike.
  const inlineUrl = avatar
    ? avatar.startsWith("avatar:")
      ? avatar
      : buildAvatarUrl(avatar)
    : null;
  const url = profile.url ?? inlineUrl;
  // Dohvaćeni profil ima prednost (uvijek točan), propovi su samo
  // trenutni fallback dok se fetch ne vrati.
  const fName = profile.firstName || firstName;
  const lName = profile.lastName || lastName;
  const uName = profile.username || username;
  const initials =
    fName && lName
      ? `${fName[0]}${lName[0]}`.toUpperCase()
      : fName
        ? fName[0].toUpperCase()
        : uName
          ? uName.slice(0, 2).toUpperCase()
          : "?";

  if (url && url.startsWith("avatar:") && PRESET_AVATARS_VID[url]) {
    return (
      <Image
        source={PRESET_AVATARS_VID[url]}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: V.forestLight,
        borderWidth: 1.5,
        borderColor: V.borderGreen,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: V.silverBright,
          fontSize: size * 0.36,
          fontWeight: "700",
        }}
      >
        {initials || "?"}
      </Text>
    </View>
  );
}

function StableAvatarInner({ userId, size }: { userId: number; size: number }) {
  return <FreshAvatar userId={userId} size={size} />;
}

// Bez imena se u React alatima i u stogu grešaka vidi samo "Anonymous",
// pa se ne zna koji je od desetak avatara u listi pao.
const StableAvatar = React.memo(
  StableAvatarInner,
  (prev, next) => prev.userId === next.userId && prev.size === next.size,
);

// ─── VARA Avatar s fallback inicijalima ───────────────────────────────────────
function VaraAvatar({
  avatar,
  firstName,
  lastName,
  size,
}: {
  avatar?: string | null;
  firstName?: string;
  lastName?: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = buildAvatarUrl(avatar);
  const initials =
    `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
  const r = size / 2;
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: r }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: V.forestLight,
        borderWidth: 1.5,
        borderColor: V.borderGreen,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: V.silverBright,
          fontSize: size * 0.36,
          fontWeight: "700",
        }}
      >
        {initials || "?"}
      </Text>
    </View>
  );
}

// ==================== SINGLE VIDEO COMPONENT ====================
function VideoItemComponent({
  item,
  isActive,
  containerHeight,
  onLikeToggle,
  onSaveToggle,
  onWishlistToggle,
  onDeleteVideo,
  onOpenComments,
  onOpenMessenger,
  onOpenShare,
  onDownload,
}: {
  item: VideoItem;
  isActive: boolean;
  containerHeight: number;
  onLikeToggle: (id: number) => void;
  onSaveToggle: (id: number) => void;
  onWishlistToggle: (id: number) => void;
  onDeleteVideo: (id: number) => void;
  onOpenComments: (v: VideoItem) => void;
  onOpenMessenger: (v: VideoItem) => void;
  onOpenShare: (v: VideoItem) => void;
  onDownload: (v: VideoItem) => void;
}) {
  const { t } = useTranslation();

  const mediaUrl = item.filePath?.startsWith("http")
    ? item.filePath
    : `${API_BASE_URL}${item.filePath?.startsWith("/") ? item.filePath : "/" + item.filePath}`;

  // Izvor se učitava tek kad je stavka aktivna (na ekranu) — prije se svaki
  // mount odmah počeo baffer(irat)i svoj video čim bi FlatList prikazao
  // stranicu unutar zadanog windowSize-a, pa je nekoliko videa istovremeno
  // trošilo mrežu i memoriju iako je vidljiv samo jedan.
  const player = useVideoPlayer(isActive ? mediaUrl : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const isImage =
    item.mediaType === "image" ||
    imageExtensions.some((ext) =>
      (item.filePath || "").toLowerCase().includes(ext),
    );

  // ✅ FIX (pauziranje videa): prijašnje verzije su odluku "pauziraj ili
  // pokreni" donosile iz React state-a (ili iz player.playing), a oboje se
  // pokazalo nepouzdanim jer JEDAN fizički dodir zna stići kao DVA onPress
  // poziva u dva različita ciklusa renderiranja: prvi pauzira, drugi (koji
  // već vidi novo stanje) odmah vrati na play — pa se izvana čini da dodir
  // "ništa ne radi". Na pauziranom videu isti mehanizam radi obrnuto (play
  // pa odmah opet pause), zbog čega se video uopće nije dao ponovno
  // pokrenuti. Sad:
  //   1) stvarno stanje reprodukcije držimo u ref-u koji se NE resetira
  //      renderiranjem i koji ispravlja sam player kroz "playingChange",
  //   2) uzastopni dodiri unutar 350 ms se ignoriraju, pa dvostruka
  //      dostava istog dodira ne može poništiti samu sebe.
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const isPlayingRef = useRef(false);
  const lastToggleRef = useRef(0);

  // Player je jedini koji zna pravu istinu — ovime ref ostaje točan i kad
  // se reprodukcija promijeni bez našeg poziva (kraj videa, greška...).
  useEventListener(player, "playingChange", ({ isPlaying }) => {
    isPlayingRef.current = isPlaying;
  });

  useEffect(() => {
    // Ranije je ovdje stajalo item.mediaType === "video" — ako backend za
    // stariju objavu ne vrati mediaType, prikaz bi (preko provjere
    // ekstenzije) ispravno renderirao video, ali bi ga ovaj efekt odmah
    // pauzirao. Sad se koristi ista provjera kao i kod renderiranja.
    if (isActive && !isImage) {
      player.play();
      isPlayingRef.current = true;
      setShowPauseIcon(false);
    } else {
      player.pause();
      isPlayingRef.current = false;
    }
  }, [isActive, player, isImage]);

  // Kad korisnik izađe iz aplikacije ili zaključa ekran, reprodukcija se
  // nastavljala: video je i dalje dekodirao, preuzimao podatke i svirao zvuk.
  // Ovdje se pauzira pri odlasku u pozadinu i nastavlja pri povratku, ali samo
  // ako je stavka i dalje aktivna i ako je svirala prije odlaska — ručno
  // pauziran video ostaje pauziran.
  const pausedByBackgroundRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (pausedByBackgroundRef.current && isActive && !isImage) {
          pausedByBackgroundRef.current = false;
          player.play();
          isPlayingRef.current = true;
        }
        pausedByBackgroundRef.current = false;
      } else if (isPlayingRef.current) {
        pausedByBackgroundRef.current = true;
        player.pause();
        isPlayingRef.current = false;
      }
    });
    return () => subscription.remove();
  }, [player, isActive, isImage]);

  const togglePlayback = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 350) return;
    lastToggleRef.current = now;

    if (isPlayingRef.current) {
      player.pause();
      isPlayingRef.current = false;
      setShowPauseIcon(true);
    } else {
      player.play();
      isPlayingRef.current = true;
      setShowPauseIcon(false);
    }
  }, [player]);

  return (
    <View style={[vs.videoContainer, { height: containerHeight }]}>
      {isImage ? (
        <Image
          source={{ uri: mediaUrl }}
          style={vs.video}
          resizeMode="contain"
        />
      ) : (
        <View style={vs.video}>
          <VideoView
            player={player}
            style={vs.video}
            contentFit="contain"
            nativeControls={false}
          />
          {/* Površina za dodir stoji IZNAD native video prikaza, a ne oko
              njega — native VideoView je zaseban Android view koji zna
              progutati dodir prije nego dođe do roditeljskog Pressablea. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={togglePlayback}
            android_disableSound
          >
            {showPauseIcon && (
              <View style={vs.pauseOverlay}>
                <Ionicons
                  name="play"
                  size={64}
                  color="rgba(255,255,255,0.85)"
                />
              </View>
            )}
          </Pressable>
        </View>
      )}

      <View style={vs.rightSidebar}>
        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onLikeToggle(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t("videos.like")}
        >
          <Ionicons
            name={item.isLiked ? "heart" : "heart-outline"}
            size={32}
            color={item.isLiked ? "#ff3b30" : "white"}
            style={vs.overlayShadow}
          />
          <Text style={vs.actionText}>{item.likeCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onOpenComments(item)}
          accessibilityRole="button"
          accessibilityLabel={t("common.comments")}
        >
          <Ionicons
            name="chatbubble-outline"
            size={28}
            color="white"
            style={vs.overlayShadow}
          />
          <Text style={vs.actionText}>{item.commentCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onOpenMessenger(item)}
          accessibilityRole="button"
          accessibilityLabel={t("videos.sendToUser")}
        >
          <Ionicons
            name="paper-plane-outline"
            size={28}
            color="white"
            style={vs.overlayShadow}
          />
          <Text style={vs.actionText}>{t("videos.sendMessage")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onOpenShare(item)}
          accessibilityRole="button"
          accessibilityLabel={t("common.share")}
        >
          <Ionicons
            name="share-social-outline"
            size={28}
            color="white"
            style={vs.overlayShadow}
          />
          <Text style={vs.actionText}>{t("common.share")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onDownload(item)}
          accessibilityRole="button"
          accessibilityLabel={t("common.download")}
        >
          <Ionicons
            name="download-outline"
            size={28}
            color="white"
            style={vs.overlayShadow}
          />
          <Text style={vs.actionText}>{t("common.download")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onSaveToggle(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t("videos.savePost")}
        >
          <Ionicons
            name={item.isSaved ? "bookmark" : "bookmark-outline"}
            size={28}
            color={item.isSaved ? V.visited : "white"}
            style={vs.overlayShadow}
          />
          {/* Prije je pisalo samo "Kutija", što ne kaže što gumb radi.
              Sad poziva na radnju, a kad je spremljeno to i potvrdi. */}
          <Text style={vs.actionText} numberOfLines={2}>
            {item.isSaved ? t("videos.savedLabel") : t("videos.saveHint")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={vs.actionButton}
          onPress={() => onWishlistToggle(item.id)}
          accessibilityRole="button"
          accessibilityLabel={t("videos.wishlist")}
        >
          <Ionicons
            name={item.isInWishlist ? "star" : "star-outline"}
            size={28}
            color={item.isInWishlist ? V.accentGold : "white"}
            style={vs.overlayShadow}
          />
          <Text style={vs.actionText}>{t("profile.wishlist")}</Text>
        </TouchableOpacity>
      </View>

      <View style={vs.bottomInfo}>
        {/* Slika i ime vode na profil autora. Dosad nisu vodili nikamo, pa se
            do nekoga čija ti se objava svidjela dolazilo jedino preko
            pretrage — i to ako mu pamtiš korisničko ime. */}
        <TouchableOpacity
          style={vs.userInfo}
          activeOpacity={0.7}
          onPress={() =>
            router.push({
              pathname: "/profile/[userId]",
              params: { userId: String(item.userId) },
            } as any)
          }
        >
          <StoryBadge userId={item.userId} size={40}>
            <FreshAvatar
              userId={item.userId}
              firstName={item.userFirstName}
              lastName={item.userLastName}
              username={item.userName}
              avatar={item.userAvatar}
              size={40}
            />
          </StoryBadge>
          <Text style={vs.userName}>
            {item.userName || `User_${item.userId}`}
          </Text>
        </TouchableOpacity>
        <Text style={vs.videoTitle}>{item.title}</Text>
        {item.location && (
          <View style={vs.locationRow}>
            <Ionicons
              name="location-outline"
              size={14}
              color="rgba(255,255,255,0.92)"
              style={vs.overlayShadow}
            />
            <Text style={vs.locationText}>{item.location}</Text>
          </View>
        )}
        {item.isEvent && item.eventStartAt && (
          <View style={vs.eventRow}>
            <Ionicons name="calendar" size={13} color="#1a2e1a" />
            <Text style={vs.eventText}>
              {t("post.eventStarts", {
                when: formatEventStart(item.eventStartAt),
              })}
            </Text>
          </View>
        )}
        {item.additionalDescription && (
          <Text style={vs.videoDescription}>{item.additionalDescription}</Text>
        )}
      </View>
    </View>
  );
}

// ==================== COMMENTS MODAL — identičan dashboard stilu =============
function CommentsModal({
  visible,
  video,
  onClose,
  onCommentAdded,
}: {
  visible: boolean;
  video: VideoItem | null;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme(); // ← DODATI
  const VT = useMemo(() => getVT(isDark), [isDark]); // ← DODATI
  const modal = useMemo(() => makeModalStyles(VT), [VT]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const commentListKey = useRef(0);
  const inputBottomOffset = useInputBottomOffset();

  const loadComments = async () => {
    if (!video) return;
    const token = await getToken();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/comment/video/${video.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setComments(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const addComment = async () => {
    if (!video || !newComment.trim()) return;
    const token = await getToken();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newComment.trim(), videoId: video.id }),
      });
      if (res.ok) {
        setNewComment("");
        await loadComments();
        onCommentAdded();
        setTimeout(
          () => scrollViewRef.current?.scrollToEnd({ animated: true }),
          100,
        );
        // Trigger na "comments" tablici već ažurira activity_logs — poziv na
        // /api/activity/track/comment ovdje bi svaki komentar brojao dvaput.
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (visible && video) loadComments();
  }, [visible, video]);
  if (!video) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: VT.bg }}>
          {/* ── Header — identičan dashboard NotificationSettingsModal / ActivityGroupsModal ── */}
          <View style={modal.header}>
            {/* Broj se prikazuje tek kad komentari postoje, i to iz stvarno
                učitane liste (ne iz zastarjelog commentCount na videu), pa
                se naslov osvježi odmah nakon objave komentara. */}
            <Text style={modal.headerTitle}>
              {comments.length > 0
                ? t("videos.commentsWithCount", { count: comments.length })
                : t("videos.commentsTitle")}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={modal.closeTxt}>{t("common.close")}</Text>
            </TouchableOpacity>
          </View>

          {/* Lista komentara */}
          {loading ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color={VT.accent} />
            </View>
          ) : comments.length === 0 ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={modal.emptyIconWrap}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={44}
                  color={VT.borderBright}
                />
              </View>
              <Text style={modal.emptyText}>{t("videos.noComments")}</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              {comments.map((item) => (
                <View key={`comment_${item.id}`} style={modal.commentRow}>
                  <StableAvatar userId={item.userId} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={modal.commentUser}>
                      {item.userName || `User_${item.userId}`}
                    </Text>
                    <Text style={modal.commentText}>{item.content}</Text>
                    <Text style={modal.commentDate}>
                      {new Date(item.createdAt).toLocaleDateString("hr-HR")}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* ── Input row ── */}
          <View
            style={[
              modal.inputRow,
              // Podigni redak iznad tipkovnice dok se piše, a kad je
              // tipkovnica skrivena ostavi razmak za Androidovu traku za
              // navigaciju gestama (bijela traka koja je dosad prekrivala
              // polje i gumb za slanje).
              { marginBottom: inputBottomOffset },
            ]}
          >
            <TextInput
              style={modal.textInput}
              placeholder={t("videos.addComment")}
              placeholderTextColor={VT.placeholder}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={addComment}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                modal.sendBtn,
                (!newComment.trim() || submitting) && modal.sendBtnDisabled,
              ]}
              onPress={addComment}
              disabled={!newComment.trim() || submitting}
              accessibilityRole="button"
              accessibilityLabel={t("common.send")}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={VT.textPrimary} />
              ) : (
                <Ionicons name="send" size={20} color={VT.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ==================== MESSENGER MODAL — identičan dashboard stilu =============
function MessengerModal({
  visible,
  video,
  onClose,
}: {
  visible: boolean;
  video: VideoItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme(); // ← DODATI
  const VT = useMemo(() => getVT(isDark), [isDark]); // ← DODATI
  const modal = useMemo(() => makeModalStyles(VT), [VT]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const inputBottomOffset = useInputBottomOffset();

  const sendMessage = async () => {
    if (!video || !message.trim()) return;
    const token = await getToken();
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/message/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: video.userId,
          content: message.trim(),
        }),
      });
      if (res.ok) {
        setMessage("");
        Alert.alert(
          t("common.success"),
          t("messages.messageSent", {
            username: video?.userName || `User_${video?.userId}`,
          }),
        );
        onClose();
      } else {
        Alert.alert(t("common.error"), t("messages.messageFailed"));
      }
    } catch {
      Alert.alert(t("common.error"), t("messages.messageFailed"));
    } finally {
      setSending(false);
    }
  };

  if (!video) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: VT.bg }}>
          {/* ── Header — identičan dashboard stilu ── */}
          <View style={modal.header}>
            <Text style={modal.headerTitle}>{t("messages.sendMessage")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={modal.closeTxt}>{t("common.close")}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Primatelj ── */}
          <View style={modal.recipientRow}>
            <FreshAvatar userId={video.userId} size={48} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={modal.recipientName}>
                {video.userName || `User_${video.userId}`}
              </Text>
              <Text style={modal.recipientSub} numberOfLines={1}>
                {video.title}
              </Text>
            </View>
          </View>

          {/* ── Quick replies ── */}
          <View style={modal.quickRow}>
            {[
              t("videos.quickMessage1"),
              t("videos.quickMessage2"),
              t("videos.quickMessage3"),
              t("videos.quickMessage4"),
            ].map((q) => (
              <TouchableOpacity
                key={q}
                style={modal.quickChip}
                onPress={() => setMessage(q)}
              >
                <Text style={modal.quickChipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Spacer ── */}
          <View style={{ flex: 1 }} />

          {/* ── Input row ── */}
          <View
            style={[
              modal.inputRow,
              // Isto kao u komentarima: iznad tipkovnice dok se piše, iznad
              // trake za navigaciju gestama kad je tipkovnica skrivena.
              { marginBottom: inputBottomOffset },
            ]}
          >
            <TextInput
              style={modal.textInput}
              placeholder={t("messages.writeMessage", {
                name: video?.userName || "",
              })}
              placeholderTextColor={VT.placeholder}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              autoFocus
            />
            <TouchableOpacity
              style={[
                modal.sendBtn,
                (!message.trim() || sending) && modal.sendBtnDisabled,
              ]}
              onPress={sendMessage}
              disabled={!message.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel={t("common.send")}
            >
              {sending ? (
                <ActivityIndicator size="small" color={VT.textPrimary} />
              ) : (
                <Ionicons name="send" size={18} color={VT.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ==================== SHARE MODAL — identičan dashboard stilu ================
function ShareModal({
  visible,
  video,
  onClose,
}: {
  visible: boolean;
  video: VideoItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme(); // ← DODATI
  const VT = useMemo(() => getVT(isDark), [isDark]); // ← DODATI
  const modal = useMemo(() => makeModalStyles(VT), [VT]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const loadUsers = async () => {
    const token = await getToken();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allUsers = await res.json();
      setUsers(allUsers.filter((u: any) => u.username !== "admin_cromap"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const shareToUser = (receiverId: number, userName: string) => {
    Alert.alert(
      "Podijeli video",
      `Jeste li sigurni da želite podijeliti video sa korisnikom ${userName}?`,
      [
        { text: "Ne", style: "cancel" },
        {
          text: "Da",
          onPress: async () => {
            if (!video) return;
            const token = await getToken();
            setSending(receiverId);
            try {
              const VIDEO_PREFIX = "__CROMAP_VIDEO__";
              const content = `${VIDEO_PREFIX}${JSON.stringify({ id: video.id, title: video.title, url: video.filePath })}`;
              const res = await fetch(`${API_BASE_URL}/api/message/send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ receiverId, content }),
              });
              if (res.ok) {
                Alert.alert(
                  t("common.success"),
                  t("videos.sharedWith", { name: userName }),
                );
                onClose();
              }
            } catch {
              Alert.alert(t("common.error"), t("videos.shareFailed"));
            } finally {
              setSending(null);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (visible) {
      loadUsers();
      setSearch("");
    }
  }, [visible]);

  const filtered = users.filter((u) =>
    u.username?.toLowerCase().includes(search.toLowerCase()),
  );
  if (!video) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: VT.bg }}>
        {/* ── Header — identičan dashboard stilu ── */}
        <View style={modal.header}>
          <Text style={modal.headerTitle}>{t("videos.shareVideo")}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={modal.closeTxt}>{t("common.close")}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Search bar — identičan dashboard filter panelu ── */}
        <View
          style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}
        >
          <View style={modal.searchBar}>
            <Ionicons
              name="search-outline"
              size={18}
              color={VT.textMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={modal.searchInput}
              placeholder={t("videos.searchUsers")}
              placeholderTextColor={VT.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
              >
                <Ionicons name="close-circle" size={18} color={VT.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Lista korisnika ── */}
        {loading ? (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <ActivityIndicator size="large" color={VT.accent} />
            <Text
              style={{ color: VT.textMuted, marginTop: 12, fontSize: T.body }}
            >
              Učitavanje...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id.toString()}
            contentContainerStyle={
              filtered.length === 0 ? { flex: 1 } : { paddingHorizontal: 12 }
            }
            renderItem={({ item: u }) => (
              <TouchableOpacity
                style={modal.userRow}
                onPress={() => shareToUser(u.id, u.username)}
                disabled={sending === u.id}
                activeOpacity={0.75}
              >
                <FreshAvatar
                  userId={u.id}
                  firstName={u.firstName}
                  lastName={u.lastName}
                  username={u.username}
                  size={48}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={modal.recipientName}>{u.username}</Text>
                  <Text style={modal.recipientSub}>
                    {u.firstName} {u.lastName}
                  </Text>
                </View>
                {sending === u.id ? (
                  <ActivityIndicator size="small" color={VT.accent} />
                ) : (
                  <View style={modal.shareIconWrap}>
                    <Ionicons
                      name="paper-plane-outline"
                      size={18}
                      color={VT.accent}
                    />
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  paddingTop: 60,
                }}
              >
                <View style={modal.emptyIconWrap}>
                  <Ionicons
                    name="people-outline"
                    size={44}
                    color={VT.borderBright}
                  />
                </View>
                <Text style={modal.emptyText}>Nema korisnika</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ==================== UPLOAD MODAL — Vara stil ================================
export function UploadModal({
  visible,
  onClose,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme(); // ← DODATI
  const VT = useMemo(() => getVT(isDark), [isDark]); // ← DODATI
  const modal = useMemo(() => makeModalStyles(VT), [VT]); // ← DODATI
  const upload = useMemo(() => makeUploadStyles(VT), [VT]);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"video" | "image">("video");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [locationValid, setLocationValid] = useState(false);
  // Koordinate odabrane lokacije. Bez njih objava ne može ući u prikaz
  // "blizu mene" — tekstualna lokacija se ne da usporediti s krajem u kojem
  // korisnik živi.
  const [locationCoords, setLocationCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [isEvent, setIsEvent] = useState(false);
  const [eventStartAt, setEventStartAt] = useState<Date | null>(null);
  const [eventPickerMode, setEventPickerMode] = useState<
    "date" | "time" | null
  >(null);
  const [locationSuggestions, setLocationSuggestions] = useState<
    {
      displayName: string;
      lat: string;
      lon: string;
      osmClass?: string;
      osmType?: string;
    }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [description, setDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showAgeGroupPicker, setShowAgeGroupPicker] = useState(false);

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleAgeGroup = (id: string) =>
    setSelectedAgeGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"pick" | "preview">("pick");

  const previewPlayer = useVideoPlayer(
    mediaType === "video" && mediaUri ? mediaUri : "",
    (p) => {
      p.loop = true;
    },
  );

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t("common.permissionRequired"),
        t("common.galleryPermission"),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === "video" ? "video" : "image");
      setStep("preview");
    }
  };

  const recordMedia = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("common.permissionRequired"), t("common.cameraPermission"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      videoMaxDuration: 60,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === "video" ? "video" : "image");
      setStep("preview");
    }
  };

  const searchLocations = (query: string) => {
    setLocation(query);
    setLocationValid(false);

    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);

    if (query.trim().length < 2) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    locationDebounceRef.current = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE_URL}/api/locationsearch/autocomplete?query=${encodeURIComponent(query.trim())}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
        if (res.ok) {
          const data = await res.json();
          setLocationSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch {
        setLocationSuggestions([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 400);
  };

  const selectLocation = (suggestion: {
    displayName: string;
    lat?: string;
    lon?: string;
    osmClass?: string;
    osmType?: string;
  }) => {
    setLocation(suggestion.displayName);
    setLocationValid(true);
    setShowSuggestions(false);
    setLocationSuggestions([]);

    const lat = Number(suggestion.lat);
    const lon = Number(suggestion.lon);
    setLocationCoords(
      Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
    );

    // Automatski predloži kategoriju i "primjereno za" na temelju adrese —
    // korisnik i dalje može ručno izmijeniti odabir, ovo samo popunjava
    // razumnu početnu vrijednost umjesto praznih obaveznih polja. Ako OSM
    // class/type ne odgovara ničemu poznatom (npr. "Velebit" je zaštićeno
    // područje, ne pojedinačni vrh, pa Nominatim zna vratiti
    // boundary=protected_area umjesto natural=peak), pokušaj prepoznati
    // kategoriju iz samog naziva mjesta prije nego odustaneš.
    const inferredCategory =
      inferCategoryFromOsmTag(suggestion.osmClass, suggestion.osmType) ||
      inferCategoryFromLocationName(suggestion.displayName);
    if (inferredCategory) {
      setSelectedCategories((prev) =>
        prev.length > 0 ? prev : [inferredCategory],
      );
      setSelectedAgeGroups((prev) =>
        prev.length > 0
          ? prev
          : inferAgeGroupsForCategory(inferredCategory, AGE_GROUP_IDS),
      );
    }
  };

  const uploadMedia = async () => {
    const token = await getToken();
    let userId = await AsyncStorage.getItem("userId");
    if (!userId || userId === "0") {
      try {
        const payload = JSON.parse(atob(token!.split(".")[1]));
        userId =
          payload[
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
          ];
      } catch {}
    }
    if (!mediaUri || !title.trim()) {
      Alert.alert(t("common.error"), t("videos.titleRequired"));
      return;
    }
    if (!location.trim()) {
      Alert.alert(t("common.error"), t("videos.locationRequired"));
      return;
    }
    if (!locationValid) {
      Alert.alert(
        "Neispravna lokacija",
        "Molimo odaberi lokaciju iz ponuđene liste kako bismo potvrdili da postoji.",
      );
      return;
    }
    if (selectedCategories.length === 0) {
      Alert.alert(t("common.error"), "Odaberite barem jednu kategoriju.");
      return;
    }
    if (selectedAgeGroups.length === 0) {
      Alert.alert(
        t("common.error"),
        "Odaberite barem jednu skupinu 'Primjereno za'.",
      );
      return;
    }
    if (!userId || userId === "0") {
      Alert.alert(t("common.error"), t("auth.notLoggedIn"));
      return;
    }

    setUploading(true);
    try {
      let mimeType = "video/mp4";
      let fileName = "media.mp4";
      if (mediaType === "image") {
        const ext = mediaUri.split(".").pop()?.toLowerCase() ?? "jpg";
        mimeType =
          ext === "png"
            ? "image/png"
            : ext === "gif"
              ? "image/gif"
              : "image/jpeg";
        fileName = `image.${ext}`;
      }
      const formData = new FormData();
      formData.append("Video", {
        uri: mediaUri,
        type: mimeType,
        name: fileName,
      } as any);

      // Sličica videa. Profil je dosad za svaki video crtao samo ikonu
      // kamere jer sličica nije nigdje postojala — sad je radi telefon iz
      // prvog kadra i šalje uz video. Ako ne uspije (neki kodeci znaju
      // zakazati), objava se svejedno nastavlja bez sličice.
      if (mediaType !== "image") {
        const thumbnailUri = await createVideoThumbnail(mediaUri);
        if (thumbnailUri) {
          formData.append("Thumbnail", {
            uri: thumbnailUri,
            type: "image/jpeg",
            name: "thumbnail.jpg",
          } as any);
        }
      }
      formData.append("Title", title.trim());
      formData.append("Location", location.trim());
      const categoriesLabel = selectedCategories
        .map((id) => t(`categories.${id}`, { defaultValue: id }))
        .join(", ");
      const ageGroupsLabel = selectedAgeGroups
        .map((id) => t(`ageGroups.${id}`, { defaultValue: id }))
        .join(", ");
      // Opis se prikazuje samo ako ga je korisnik stvarno unio — bez
      // placeholder teksta ("Nema opisa") kad je polje prazno, kako se
      // prazna sekcija ne bi prikazivala u objavi.
      let finalDescription = `📂 Kategorije: ${categoriesLabel}\n👥 Primjereno za: ${ageGroupsLabel}`;
      if (description.trim()) {
        finalDescription += `\n\n${description.trim()}`;
      }

      formData.append("Description", finalDescription);
      // Uz prevedene nazive u opisu šaljemo i STABILNE oznake. Bez njih
      // poslužitelj ne može usporediti kategorije objave s kategorijama koje
      // netko prati — "Parkovi" i "Parks" su za njega dva različita niza.
      formData.append("Categories", selectedCategories.join(","));
      formData.append("AgeGroups", selectedAgeGroups.join(","));
      formData.append("UserId", userId);
      formData.append("MediaType", mediaType);

      if (locationCoords) {
        formData.append("Latitude", String(locationCoords.lat));
        formData.append("Longitude", String(locationCoords.lon));
      }
      if (isEvent && eventStartAt) {
        formData.append("IsEvent", "true");
        formData.append("EventStartAt", eventStartAt.toISOString());
      }

      const res = await fetch(`${API_BASE_URL}/api/video/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        // Trigger na "videos" tablici već ažurira activity_logs.posts —
        // poziv na /api/activity/track/post ovdje bi svaku objavu brojao
        // dvaput.
        Alert.alert(
          t("common.success"),
          t("videos.publishSuccess", {
            type: mediaType === "image" ? t("videos.image") : t("videos.video"),
          }),
        );
        resetModal();
        onUploaded();
      } else {
        Alert.alert(t("common.error"), t("videos.uploadFailed"));
      }
    } catch {
      Alert.alert(t("common.error"), t("videos.uploadFailedCheckConnection"));
    } finally {
      setUploading(false);
    }
  };

  // Prekidač se unaprijed uključi ako naslov ili opis zvuče kao najava —
  // ali samo jednom po objavi, da isključivanje ne bi bilo poništeno pri
  // sljedećem tipkanju.
  const eventHintAppliedRef = useRef(false);
  useEffect(() => {
    if (eventHintAppliedRef.current) return;
    if (!looksLikeEvent(title, description)) return;
    eventHintAppliedRef.current = true;
    setIsEvent(true);
  }, [title, description]);

  const resetModal = () => {
    setMediaUri(null);
    setTitle("");
    setLocation("");
    setLocationValid(false);
    setLocationCoords(null);
    setLocationSuggestions([]);
    setShowSuggestions(false);
    setDescription("");
    setIsEvent(false);
    setEventStartAt(null);
    setEventPickerMode(null);
    eventHintAppliedRef.current = false;
    setStep("pick");
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={resetModal}
    >
      {/* Bez KeyboardAvoidingViewa: on se na Androidu oslanja na to da
          sustav sam smanji prozor kad se otvori tipkovnica, a prozor
          <Modal>-a to ne radi (zaseban je prozor i ne nasljeđuje
          "adjustResize"). Umjesto toga mjerimo visinu tipkovnice i za
          toliko povećamo donji razmak unutar forme, pa se fokusirano polje
          uvijek može doskrolati iznad tipkovnice. */}
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: VT.bg }}>
          {/* Header */}
          <View style={modal.header}>
            <Text style={modal.headerTitle}>
              {step === "pick" ? "Dodaj sadržaj" : "Pregled i objava"}
            </Text>
            <CloseButton onPress={resetModal} tone="muted" />
          </View>

          <ScrollView
            // ✅ FIX: bio je samo "contentContainerStyle" s tamnom
            // pozadinom — to boja SAMO stvarni sadržaj, ne i cijeli vidljivi
            // prostor ScrollViewa. Na koraku "Dodaj sadržaj" (svega dva
            // gumba, puno kraće od visine ekrana) prostor ISPOD sadržaja
            // ostajao je neobojan, pa je kroz njega prosijavala pozadina
            // SafeAreaViewa iznad (VT.bg — u svjetlom modu kremasta), što je
            // izgledalo kao svijetla traka pri dnu ekrana koja ne pripada
            // VARA temi. Tamna pozadina sad je na samom ScrollView "style"-u
            // (cijeli vidljivi prostor), ne samo na contentContainerStyle-u.
            style={{ flex: 1, backgroundColor: V.forestDeep }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 32 + keyboardHeight,
            }}
          >
            {step === "pick" ? (
              /* ── ODABIR IZVORA ── */
              <View style={upload.pickContainer}>
                <Text style={upload.pickHint}>Odaberi vrstu i izvor</Text>
                <TouchableOpacity
                  style={upload.pickBtn}
                  onPress={pickFromGallery}
                >
                  <View style={upload.pickIconWrap}>
                    <Ionicons name="images" size={40} color={VT.accent} />
                  </View>
                  <Text style={upload.pickBtnText}>Iz galerije</Text>
                  <Text style={upload.pickBtnSub}>Slike i videji</Text>
                </TouchableOpacity>
                <TouchableOpacity style={upload.pickBtn} onPress={recordMedia}>
                  <View style={upload.pickIconWrap}>
                    <Ionicons name="camera" size={40} color={VT.accent} />
                  </View>
                  <Text style={upload.pickBtnText}>Kamera / Snimanje</Text>
                  <Text style={upload.pickBtnSub}>Snimite sliku ili video</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ── PREVIEW + FORMA ── */
              <>
                <View style={upload.previewContainer}>
                  {mediaType === "image" ? (
                    <Image
                      source={{ uri: mediaUri ?? "" }}
                      style={upload.previewMedia}
                      resizeMode="cover"
                    />
                  ) : (
                    <VideoView
                      player={previewPlayer}
                      style={upload.previewMedia}
                      contentFit="cover"
                      nativeControls={false}
                    />
                  )}
                  <View style={upload.mediaTypeBadge}>
                    <Ionicons
                      name={mediaType === "video" ? "videocam" : "image"}
                      size={14}
                      color="#fff"
                    />
                    <Text style={upload.mediaTypeBadgeText}>
                      {mediaType === "video" ? "Video" : "Slika"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={upload.changeBtn}
                    onPress={() => {
                      setMediaUri(null);
                      setStep("pick");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.retry")}
                  >
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text
                      style={{ color: "#fff", fontSize: T.meta, marginLeft: 4 }}
                    >
                      Promijeni
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={upload.fieldLabel}>Naslov *</Text>
                <TextInput
                  style={upload.fieldInput}
                  placeholder="Naslov objave"
                  placeholderTextColor={VT.placeholder}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={100}
                />

                <Text style={upload.fieldLabel}>
                  Lokacija *
                  <Text style={{ color: "#C05050", fontSize: T.meta }}>
                    {" "}
                    (obavezno)
                  </Text>
                </Text>
                <View style={{ position: "relative", zIndex: 20 }}>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={[
                        upload.fieldInput,
                        locationValid && { borderColor: V.visited },
                      ]}
                      placeholder="Npr. Osijek..."
                      placeholderTextColor={VT.placeholder}
                      value={location}
                      onChangeText={searchLocations}
                      maxLength={150}
                    />
                    {searchingLocation && (
                      <ActivityIndicator
                        size="small"
                        color={VT.accent}
                        style={{ position: "absolute", right: 14, top: 14 }}
                      />
                    )}
                    {locationValid && !searchingLocation && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={V.visited}
                        style={{ position: "absolute", right: 12, top: 13 }}
                      />
                    )}
                  </View>

                  {showSuggestions && (
                    <View
                      style={{
                        // Popis stoji u toku layouta, ne apsolutno.
                        //
                        // Bio je "position: absolute; top: 100%", da polja
                        // ispod ne poskakuju dok se otvara i zatvara. Ali
                        // time je ispadao izvan granica roditelja, a Android
                        // dodir ne prosljeđuje djetetu nacrtanom izvan
                        // roditeljskih granica: popis se vidio, no nije se
                        // dao ni pomaknuti ni odabrati — od šest ponuđenih
                        // mjesta vidjela su se dva i pol.
                        //
                        // Polja ispod se sada pomaknu dok je popis otvoren.
                        // To je uobičajeno ponašanje šapatnika i podnošljivo;
                        // popis koji se ne da prolistati nije.
                        backgroundColor: VT.bgCard,
                        borderWidth: 1,
                        borderColor: VT.borderBright,
                        borderRadius: 10,
                        marginTop: 4,
                        maxHeight: 260,
                        overflow: "hidden",
                        elevation: 8,
                      }}
                    >
                      <ScrollView
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                      >
                        {locationSuggestions.map((s, idx) => (
                          <TouchableOpacity
                            key={`${s.lat}_${s.lon}_${idx}`}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              borderBottomWidth:
                                idx < locationSuggestions.length - 1 ? 1 : 0,
                              borderBottomColor: VT.border,
                            }}
                            onPress={() => selectLocation(s)}
                          >
                            <Text
                              style={{
                                color: VT.textPrimary,
                                fontSize: T.body,
                              }}
                            >
                              {s.displayName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <Text style={upload.fieldLabel}>
                  Kategorije *
                  <Text style={{ color: "#C05050", fontSize: T.meta }}>
                    {" "}
                    (obavezno)
                  </Text>
                </Text>
                <TouchableOpacity
                  style={[
                    upload.fieldInput,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                  ]}
                  onPress={() => {
                    // ✅ FIX: bez ovoga, blur polja lokacije (zatvaranje
                    // tastature) i otvaranje ovog modala ("slide" animacija)
                    // događali su se u istom trenu — na Androidu se
                    // KeyboardAvoidingView (koji smanjuje visinu forme dok
                    // je tastatura otvorena) i animacija modala natežu oko
                    // visine ekrana istovremeno, što se vidi kao da ekran
                    // "vibrira"/trese na trenutak. Explicitni Keyboard.dismiss()
                    // prije otvaranja modala razdvaja ta dva pomicanja.
                    Keyboard.dismiss();
                    setShowCategoryPicker(true);
                  }}
                >
                  <Text
                    style={{
                      color: selectedCategories.length
                        ? VT.textPrimary
                        : VT.placeholder,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {selectedCategories.length
                      ? selectedCategories
                          .map((id) =>
                            t(`categories.${id}`, { defaultValue: id }),
                          )
                          .join(", ")
                      : "Odaberi kategorije..."}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={VT.textMuted}
                  />
                </TouchableOpacity>

                <Text style={upload.fieldLabel}>
                  Primjereno za *
                  <Text style={{ color: "#C05050", fontSize: T.meta }}>
                    {" "}
                    (obavezno)
                  </Text>
                </Text>
                <TouchableOpacity
                  style={[
                    upload.fieldInput,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowAgeGroupPicker(true);
                  }}
                >
                  <Text
                    style={{
                      color: selectedAgeGroups.length
                        ? VT.textPrimary
                        : VT.placeholder,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {selectedAgeGroups.length
                      ? selectedAgeGroups
                          .map((id) =>
                            t(`ageGroups.${id}`, { defaultValue: id }),
                          )
                          .join(", ")
                      : "Odaberi primjereno za..."}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={VT.textMuted}
                  />
                </TouchableOpacity>

                {/* Događaj — autor sam kaže je li ovo najava i kad počinje.
                    Zato je datum pouzdan i nad njim se može raditi
                    ("počinje za 2 dana"), što se iz teksta ne bi moglo. */}
                <View style={upload.eventRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={upload.eventLabel}>{t("post.isEvent")}</Text>
                    <Text style={upload.eventHint}>
                      {t("post.isEventHint")}
                    </Text>
                  </View>
                  <Switch
                    value={isEvent}
                    onValueChange={(v) => {
                      setIsEvent(v);
                      if (!v) setEventStartAt(null);
                    }}
                    trackColor={{ true: "#5a8a48", false: "#3a5a30" }}
                    thumbColor={isEvent ? "#34c759" : "#888"}
                  />
                </View>

                {isEvent && (
                  <TouchableOpacity
                    style={[
                      upload.fieldInput,
                      { flexDirection: "row", alignItems: "center" },
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setEventPickerMode("date");
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        color: eventStartAt ? VT.textPrimary : VT.placeholder,
                      }}
                      numberOfLines={1}
                    >
                      {eventStartAt
                        ? `${eventStartAt.toLocaleDateString()} ${eventStartAt.toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}`
                        : t("post.eventWhenPlaceholder")}
                    </Text>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={VT.textMuted}
                    />
                  </TouchableOpacity>
                )}

                {eventPickerMode && (
                  <DateTimePicker
                    value={eventStartAt ?? new Date()}
                    mode={eventPickerMode}
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={
                      eventPickerMode === "date" ? new Date() : undefined
                    }
                    onChange={(event, picked) => {
                      // Android pita za datum i vrijeme u dva koraka.
                      if (event.type === "dismissed" || !picked) {
                        setEventPickerMode(null);
                        return;
                      }
                      if (eventPickerMode === "date") {
                        const base = eventStartAt ?? new Date();
                        const next = new Date(picked);
                        next.setHours(base.getHours(), base.getMinutes(), 0, 0);
                        setEventStartAt(next);
                        setEventPickerMode("time");
                      } else {
                        const next = new Date(eventStartAt ?? picked);
                        next.setHours(
                          picked.getHours(),
                          picked.getMinutes(),
                          0,
                          0,
                        );
                        setEventStartAt(next);
                        setEventPickerMode(null);
                      }
                    }}
                  />
                )}

                <Text style={upload.fieldLabel}>Opis (opcionalno)</Text>
                <TextInput
                  style={[
                    upload.fieldInput,
                    { height: 80, textAlignVertical: "top" },
                  ]}
                  placeholder="Kratki opis..."
                  placeholderTextColor={VT.placeholder}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  maxLength={300}
                />

                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    marginTop: 24,
                    // ✅ FIX: obična SafeAreaView (iz "react-native", ne
                    // "react-native-safe-area-context") na Androidu ne
                    // računa donji "inset" gesta navigacije — gumbi su
                    // renderirani do samog dna sadržaja, koji Android-ova
                    // prozirna traka za navigaciju gestama onda djelomično
                    // prekriva. insets.bottom je stvarna visina te trake.
                    marginBottom: insets.bottom,
                  }}
                >
                  <TouchableOpacity
                    style={[
                      upload.actionBtn,
                      {
                        flex: 1,
                        backgroundColor: V.dangerFill,
                        borderColor: "#5A3030",
                      },
                    ]}
                    onPress={() => {
                      setMediaUri(null);
                      setStep("pick");
                    }}
                    disabled={uploading}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={22}
                      color={V.silverBright}
                    />
                    <Text style={upload.actionBtnText}>Obriši</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      upload.actionBtn,
                      {
                        flex: 1,
                        backgroundColor: uploading
                          ? V.borderDim
                          : V.forestLight,
                        borderColor: uploading ? V.borderDim : V.borderGreen,
                      },
                    ]}
                    onPress={uploadMedia}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator color={V.silverBright} />
                    ) : (
                      <>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={22}
                          color={V.silverBright}
                        />
                        <Text style={upload.actionBtnText}>Objavi</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>

          <Modal
            visible={showCategoryPicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowCategoryPicker(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: "rgba(0,0,0,0.5)",
              }}
            >
              <View
                style={{
                  backgroundColor: VT.bg,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  maxHeight: "75%",
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: T.lead,
                    fontWeight: "800",
                    color: VT.textPrimary,
                    marginBottom: 12,
                  }}
                >
                  Odaberi kategorije
                </Text>
                <ScrollView>
                  {POST_CATEGORY_IDS.map((id) => {
                    const active = selectedCategories.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => toggleCategory(id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: VT.border,
                        }}
                      >
                        <Text
                          style={{ color: VT.textPrimary, fontSize: T.body }}
                        >
                          {t(`categories.${id}`, { defaultValue: id })}
                        </Text>
                        {active && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={VT.accent}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={{
                    backgroundColor: VT.bgLight,
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: 12,
                  }}
                  onPress={() => setShowCategoryPicker(false)}
                >
                  <Text style={{ color: VT.textPrimary, fontWeight: "700" }}>
                    Potvrdi
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={showAgeGroupPicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowAgeGroupPicker(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: "rgba(0,0,0,0.5)",
              }}
            >
              <View
                style={{
                  backgroundColor: VT.bg,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  maxHeight: "75%",
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: T.lead,
                    fontWeight: "800",
                    color: VT.textPrimary,
                    marginBottom: 12,
                  }}
                >
                  Odaberi primjereno za
                </Text>
                <ScrollView>
                  {AGE_GROUP_IDS.map((id) => {
                    const active = selectedAgeGroups.includes(id);
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => toggleAgeGroup(id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: VT.border,
                        }}
                      >
                        <Text
                          style={{ color: VT.textPrimary, fontSize: T.body }}
                        >
                          {t(`ageGroups.${id}`, { defaultValue: id })}
                        </Text>
                        {active && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={VT.accent}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={{
                    backgroundColor: VT.bgLight,
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: 12,
                  }}
                  onPress={() => setShowAgeGroupPicker(false)}
                >
                  <Text style={{ color: VT.textPrimary, fontWeight: "700" }}>
                    Potvrdi
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ==================== MAIN SCREEN ============================================
export default function VideosScreen() {
  const { t } = useTranslation();
  const { isDark } = useTheme(); // ← DODATI
  const VT = useMemo(() => getVT(isDark), [isDark]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [containerHeight, setContainerHeight] = useState(
    Dimensions.get("window").height,
  );
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(
    null,
  );
  const [selectedVideoForComments, setSelectedVideoForComments] =
    useState<VideoItem | null>(null);
  const [selectedVideoForMessenger, setSelectedVideoForMessenger] =
    useState<VideoItem | null>(null);
  const [selectedVideoForShare, setSelectedVideoForShare] =
    useState<VideoItem | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // "local" = objave iz krajeva u kojima se korisnik zaista zadržava,
  // "global" = sve. Izbor se pamti da se ne mora birati pri svakom ulasku.
  const [scope, setScope] = useState<"local" | "global">("local");
  const [scopeReady, setScopeReady] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 15;

  // Feed sada dolazi po stranicama umjesto da se cijela tablica videa
  // učita odjednom na svako otvaranje taba — bez ovoga je /api/video
  // vraćao SVE videe u bazi u jednom odgovoru, što je bilo sve sporije
  // (i teže za memoriju) kako je raslo videa.
  const loadVideos = async (pageToLoad = 1) => {
    const token = await getToken();
    if (!token) return;
    if (pageToLoad === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/video?page=${pageToLoad}&pageSize=${PAGE_SIZE}&scope=${scope}&radiusKm=${radiusKm}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Odgovor koji nije `ok` prije se jednostavno preskakao, pa je
      // neuspjeh izgledao isto kao prazan feed.
      if (!res.ok) throw new Error(String(res.status));

      const data: VideoItem[] = await res.json();
      setVideos((prev) => (pageToLoad === 1 ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
      setPage(pageToLoad);
      setLoadFailed(false);
    } catch {
      // Prekidajući Alert zamijenjen je stanjem na ekranu: ono ostaje dok
      // se ne riješi i nosi gumb za ponovni pokušaj. Kad popis već ima
      // sadržaj, stara objava se NE briše — greška se pokaže kao traka.
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  const refreshVideos = () => {
    setRefreshing(true);
    loadVideos(1);
  };

  /**
   * Spremi odabrani domet.
   *
   * Lokalno jer feed šalje radijus uz svaki upit, i na poslužitelj jer o istoj
   * brojci ovisi kome obavijest ide. Ako spremanje na poslužitelj ne uspije,
   * feed svejedno radi — samo obavijesti ostaju na staroj vrijednosti, pa se
   * to i kaže umjesto da tiho prođe.
   */
  const applyRadius = async (km: number) => {
    setRadiusKm(km);
    setShowRadiusPicker(false);
    AsyncStorage.setItem(STORAGE_FEED_RADIUS, String(km)).catch(() => {});

    const prefs = await getNotificationPreferences();
    if (!prefs) return;

    const result = await saveNotificationPreferences({
      ...prefs,
      radiusKm: km,
    });
    if (!result.ok) {
      Alert.alert(
        t("common.error"),
        t("videos.radiusSaveFailed") +
          " " +
          t(saveFailureMessageKey(result.reason)) +
          saveFailureDetail(result),
      );
    }
  };

  const loadMoreVideos = () => {
    if (!loadingMore && hasMore) loadVideos(page + 1);
  };

  // Zapamćeni izbor prikaza; tek kad je poznat, učitaj feed — inače bi se
  // učitao dvaput (jednom s pogrešnim opsegom).
  useEffect(() => {
    (async () => {
      try {
        const [stored, storedRadius] = await Promise.all([
          AsyncStorage.getItem(STORAGE_FEED_SCOPE),
          AsyncStorage.getItem(STORAGE_FEED_RADIUS),
        ]);
        if (stored === "local" || stored === "global") setScope(stored);
        const parsed = Number(storedRadius);
        if (Number.isFinite(parsed) && parsed > 0) {
          setRadiusKm(Math.min(parsed, 100));
        }
      } catch {}
      setScopeReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!scopeReady) return;
    setPage(1);
    setHasMore(true);
    loadVideos(1);
    // Radijus je u popisu ovisnosti jer mijenja koje objave feed uopće vraća.
  }, [scope, scopeReady, radiusKm]);

  // Javi poslužitelju u kojem je kraju korisnik, da "blizu mene" uopće ima
  // što prikazati. Samo dok je aplikacija otvorena i samo ako je dozvola
  // već dana — ništa se ne traži niti prati u pozadini.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;

        const position = await Location.getLastKnownPositionAsync();
        if (!position) return;

        const token = await getToken();
        if (!token) return;

        await fetch(`${API_BASE_URL}/api/video/area-ping`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        });
      } catch {}
    })();
  }, []);

  const handleLikeToggle = async (videoId: number) => {
    const token = await getToken();
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? {
              ...v,
              isLiked: !v.isLiked,
              likeCount: v.isLiked
                ? (v.likeCount ?? 1) - 1
                : (v.likeCount ?? 0) + 1,
            }
          : v,
      ),
    );
    try {
      // Napomena: ne zovemo ovdje i /api/activity/track/like — baza već
      // ima trigger na "likes" tablici koji atomično (i ispravno u oba
      // smjera, like/unlike) ažurira activity_logs. Poziv odavde je
      // dupliciralo brojanje (i čak nije razlikovalo like od unlike, pa je
      // unlike znao "poništiti" pravi trigger-ov decrement).
      await fetch(`${API_BASE_URL}/api/like/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId }),
      });
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? {
                ...v,
                isLiked: !v.isLiked,
                likeCount: v.isLiked
                  ? (v.likeCount ?? 1) - 1
                  : (v.likeCount ?? 0) + 1,
              }
            : v,
        ),
      );
    }
  };

  const handleSaveToggle = async (videoId: number) => {
    const token = await getToken();
    const video = videos.find((v) => v.id === videoId);
    if (!video) return;
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, isSaved: !v.isSaved } : v)),
    );
    try {
      if (!video.isSaved) {
        await fetch(`${API_BASE_URL}/api/savedvideo/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ videoId }),
        });
        await offerCategoryFollow(video, t);
      } else {
        const userId = await AsyncStorage.getItem("userId");
        await fetch(
          `${API_BASE_URL}/api/savedvideo/unsave?videoId=${videoId}&userId=${userId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      }
    } catch {
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, isSaved: !v.isSaved } : v)),
      );
      Alert.alert(t("common.error"), t("videos.boxToggleFailed"));
    }
  };

  const handleWishlistToggle = async (videoId: number) => {
    const token = await getToken();
    const video = videos.find((v) => v.id === videoId);
    if (!video) return;
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId ? { ...v, isInWishlist: !v.isInWishlist } : v,
      ),
    );
    try {
      if (!video.isInWishlist) {
        await fetch(`${API_BASE_URL}/api/wishlistvideo/add`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ videoId, notes: "" }),
        });
        Alert.alert(
          t("videos.addedToWishlistTitle"),
          t("videos.addedToWishlistDesc"),
        );
      } else {
        const userId = await AsyncStorage.getItem("userId");
        await fetch(
          `${API_BASE_URL}/api/wishlistvideo/remove?userId=${userId}&videoId=${videoId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      }
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, isInWishlist: !v.isInWishlist } : v,
        ),
      );
      Alert.alert(t("common.error"), t("videos.wishlistToggleFailed"));
    }
  };

  const handleDownload = async (video: VideoItem) => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permissionRequired"), t("common.mediaPermission"));
      return;
    }
    Alert.alert(t("videos.downloading"), t("videos.downloadingDesc"));
    try {
      const fileName = `cromap_${video.id}_${Date.now()}.mp4`;
      const downloadDest = FileSystem.documentDirectory + fileName;
      const result = await FileSystem.downloadAsync(
        video.filePath,
        downloadDest,
      );
      await MediaLibrary.saveToLibraryAsync(result.uri);
      Alert.alert(t("common.success"), t("videos.downloadSuccess"));
    } catch {
      Alert.alert(t("common.error"), t("videos.downloadFailed"));
    }
  };

  const handleDeleteVideo = async (videoId: number) => {
    Alert.alert(t("videos.deleteConfirm"), t("videos.deleteConfirmQuestion"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          const token = await getToken();
          try {
            const res = await fetch(`${API_BASE_URL}/api/video/${videoId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok)
              setVideos((prev) => prev.filter((v) => v.id !== videoId));
          } catch {
            Alert.alert("Greška", "Brisanje nije uspjelo");
          }
        },
      },
    ]);
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0)
      setCurrentPlayingIndex(viewableItems[0].index);
  }, []);

  if (loading)
    return (
      <View style={vs.centerContainer}>
        <ActivityIndicator size="large" color={VT.accent} />
      </View>
    );

  return (
    <View
      style={vs.container}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {/* Blizu mene / Svugdje. Stoji na vrhu jer mijenja cijeli feed, a ne
          pojedinu objavu. */}
      <View style={vs.scopeBar}>
        {(["local", "global"] as const).map((value) => {
          const active = scope === value;
          return (
            <TouchableOpacity
              key={value}
              style={[vs.scopeBtn, active && vs.scopeBtnActive]}
              onPress={() => {
                // Ponovni pritisak na već odabrano "Blizu mene" otvara izbor
                // dometa — tu ga korisnik i traži, a traka ostaje čista.
                if (active) {
                  if (value === "local") setShowRadiusPicker(true);
                  return;
                }
                setScope(value);
                AsyncStorage.setItem(STORAGE_FEED_SCOPE, value).catch(() => {});
              }}
            >
              <Text style={[vs.scopeText, active && vs.scopeTextActive]}>
                {value === "local"
                  ? `${t("videos.scopeLocal")} · ${radiusKm} km`
                  : t("videos.scopeGlobal")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Izbor dometa za "blizu mene". Ista brojka vrijedi i za obavijesti —
          korisnik jednom kaže što mu je blizu, a ne posebno za svaki dio
          aplikacije. */}
      <Modal
        visible={showRadiusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRadiusPicker(false)}
      >
        <Pressable
          style={vs.radiusBackdrop}
          onPress={() => setShowRadiusPicker(false)}
        >
          <Pressable style={vs.radiusCard} onPress={() => {}}>
            <Text style={vs.radiusTitle}>{t("videos.radiusTitle")}</Text>
            <Text style={vs.radiusHint}>{t("videos.radiusHint")}</Text>

            {RADIUS_OPTIONS.map((km) => {
              const chosen = km === radiusKm;
              return (
                <TouchableOpacity
                  key={km}
                  style={[vs.radiusRow, chosen && vs.radiusRowActive]}
                  onPress={() => applyRadius(km)}
                >
                  <Text
                    style={[vs.radiusRowText, chosen && vs.radiusRowTextActive]}
                  >
                    {t("videos.radiusValue", { km })}
                  </Text>
                  {chosen && (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={vs.radiusClose}
              onPress={() => setShowRadiusPicker(false)}
            >
              <Text style={vs.radiusCloseText}>{t("common.close")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <TouchableOpacity
        style={vs.addButton}
        onPress={() => setShowUploadModal(true)}
        accessibilityRole="button"
        accessibilityLabel={t("common.add")}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={videos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, index }) => (
          <VideoItemComponent
            item={item}
            isActive={index === currentPlayingIndex}
            containerHeight={containerHeight}
            onLikeToggle={handleLikeToggle}
            onSaveToggle={handleSaveToggle}
            onWishlistToggle={handleWishlistToggle}
            onDeleteVideo={handleDeleteVideo}
            onOpenComments={setSelectedVideoForComments}
            onOpenMessenger={setSelectedVideoForMessenger}
            onOpenShare={setSelectedVideoForShare}
            onDownload={handleDownload}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        snapToInterval={containerHeight}
        decelerationRate="fast"
        onEndReached={loadMoreVideos}
        onEndReachedThreshold={0.5}
        // Povlačenje za osvježavanje: prvo što korisnik instinktivno
        // pokuša kad nešto ne izgleda ispravno.
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshVideos}
            tintColor={V.silver}
            colors={[V.primary]}
            progressBackgroundColor={V.forestMid}
          />
        }
        ListEmptyComponent={
          loading ? null : loadFailed ? (
            <View style={{ height: containerHeight, justifyContent: "center" }}>
              <StateView
                tone="error"
                title={t("common.loadFailedTitle")}
                body={t("common.loadFailedBody")}
                onRetry={() => loadVideos(1)}
                retrying={loading}
              />
            </View>
          ) : (
            <View style={{ height: containerHeight, justifyContent: "center" }}>
              <StateView
                tone="empty"
                icon="videocam-outline"
                title={t("videos.emptyTitle")}
                body={
                  scope === "local"
                    ? t("videos.emptyBodyLocal")
                    : t("videos.emptyBodyGlobal")
                }
                action={{
                  label: t("videos.emptyAction"),
                  onPress: () => setShowUploadModal(true),
                }}
              />
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ height: containerHeight, justifyContent: "center" }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null
        }
        // Svaka stavka nosi svoj video player, pa se broj istovremeno
        // mountanih stavki mora agresivno ograničiti (zadani windowSize=21
        // bi držao montirano i do ~10 ekrana iznad/ispod trenutnog).
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews={Platform.OS === "android"}
      />

      <CommentsModal
        visible={selectedVideoForComments !== null}
        video={selectedVideoForComments}
        onClose={() => setSelectedVideoForComments(null)}
        onCommentAdded={loadVideos}
      />
      <MessengerModal
        visible={selectedVideoForMessenger !== null}
        video={selectedVideoForMessenger}
        onClose={() => setSelectedVideoForMessenger(null)}
      />
      <ShareModal
        visible={selectedVideoForShare !== null}
        video={selectedVideoForShare}
        onClose={() => setSelectedVideoForShare(null)}
      />
      <UploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploaded={loadVideos}
      />
    </View>
  );
}

// ─── Video screen stilovi ─────────────────────────────────────────────────────
const vs = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  videoContainer: {
    width,

    position: "relative",
    backgroundColor: "#000",
  },
  video: { width: "100%", height: "100%" },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  rightSidebar: {
    position: "absolute",
    // Spušten zajedno s tekstom, da traka i opis objave ostanu poravnati.
    bottom: 56,
    right: 12,
    alignItems: "center",
    gap: 16,
  },
  actionButton: { alignItems: "center", gap: 2 },

  // Bijelo po bijelom.
  //
  // Ikone i natpisi preko objave uvijek su bili čisto bijeli, što na tamnom
  // videu izgleda dobro, a na svijetloj fotografiji (nebo, snijeg, bijelo
  // pročelje) nestane — komentari i "Podijeli" naprosto se nisu vidjeli.
  //
  // Umjesto podloge ili obruba, koji bi na tamnim objavama nepotrebno
  // stršili, ide meka tamna sjena. Na tamnoj podlozi se ne primjećuje, a na
  // svijetloj odvoji slovo od pozadine. Ionicons se iscrtava kao tekst, pa
  // ista sjena radi i za ikone.
  overlayShadow: {
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  actionText: {
    color: "white",
    fontSize: T.caption,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 68,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  bottomInfo: {
    position: "absolute",
    // Navigacijska traka ima svoj prostor rezerviran izvan ovog ekrana, pa je
    // 80 px ovdje bilo čisto praznog crnila između teksta i trake. Tekst sada
    // stoji pri dnu objave, gdje mu je i mjesto.
    bottom: 24,
    left: 16,
    right: 90,
    // Zastor iza teksta.
    //
    // Sjena pomaže na običnoj fotografiji, ali kad objava i sama ima krupan
    // bijeli natpis (plakat, najava događaja), bijelo ime i lokacija stope se
    // s njim i ništa se ne da pročitati. Prozirniji sloj još je propuštao
    // slova plakata kroz sebe, pa je ovaj gušći: na tamnoj objavi se i dalje
    // jedva primijeti, a na plakatu čisto odvoji tekst aplikacije od slike.
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userInfo: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  userName: {
    color: "white",
    fontSize: T.body,
    fontWeight: "600",
    marginLeft: 8,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  videoTitle: {
    color: "white",
    fontSize: T.body,
    fontWeight: "bold",
    marginBottom: 2,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  locationText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: T.meta,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  // Termin događaja stoji preko videa, pa ide na svijetlu podlogu s tamnim
  // tekstom — bijelo na bijelom kadru se ne bi vidjelo.
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    backgroundColor: "#d0e8c0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
    marginBottom: 3,
  },
  eventText: { color: "#1a2e1a", fontSize: T.meta, fontWeight: "700" },
  videoDescription: { color: "rgba(255,255,255,0.75)", fontSize: T.meta },
  scopeBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 36,
    alignSelf: "center",
    flexDirection: "row",
    backgroundColor: "rgba(20,40,20,0.85)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(90,138,72,0.6)",
    padding: 3,
    zIndex: 20,
  },
  scopeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
  },
  scopeBtnActive: { backgroundColor: "#5a8a48" },
  scopeText: { color: "#c0d8b0", fontSize: T.meta, fontWeight: "600" },
  scopeTextActive: { color: "#fff" },
  radiusBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  radiusCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#16301a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2f5a33",
    padding: 20,
  },
  radiusTitle: {
    color: "#fff",
    fontSize: T.lead,
    fontWeight: "700",
    marginBottom: 4,
  },
  radiusHint: {
    color: "#b6cfae",
    fontSize: T.meta,
    lineHeight: 18,
    marginBottom: 14,
  },
  radiusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f5a33",
    marginBottom: 8,
  },
  radiusRowActive: { backgroundColor: "#5a8a48", borderColor: "#5a8a48" },
  radiusRowText: { color: "#d8e8d0", fontSize: T.body, fontWeight: "600" },
  radiusRowTextActive: { color: "#fff" },
  radiusClose: {
    marginTop: 6,
    alignItems: "center",
    paddingVertical: 12,
  },
  radiusCloseText: { color: "#b6cfae", fontSize: T.body, fontWeight: "600" },
  addButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 40,
    right: 16,
    backgroundColor: V.forestLight,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: V.borderGreen,
  },
});

// ─── Modal stilovi — VARA, identični dashboard.tsx ────────────────────────────
// const modal = StyleSheet.create({
//   // ── Header — identičan svim dashboard modalima ──────────────────────────────
//   // Uspoređeno s: NotificationSettingsModal, ActivityGroupsModal, VisitArchiveModal,
//   //               BadgesModal, PlanMyDayModal, VisitArchiveModal u dashboard.tsx
//   header: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     padding: 20,
//     paddingTop: Platform.OS === "ios" ? 54 : 36, // ← identičan dashboard (ag.chatHeader)
//     borderBottomWidth: 1.5,
//     borderBottomColor: V.borderGreen, // ← identičan dashboard (#4a7040)
//     backgroundColor: V.forestDeep, // ← identičan dashboard (#1a2e1a)
//   },
//   headerTitle: {
//     fontSize: T.title,
//     fontWeight: "800",
//     color: V.silverBright, // ← identičan dashboard (#e8e8e8)
//   },
//   // ── "Zatvori" — čisti tekst, identičan dashboard ────────────────────────────
//   // Dashboard koristi: fontSize: T.body, color: "#b0b0b0", fontWeight: "600"
//   closeTxt: {
//     fontSize: T.body,
//     fontWeight: "600",
//     color: V.silverDim, // ← #8A9486, blizu "#b0b0b0"
//   },

//   // ── Empty state ─────────────────────────────────────────────────────────────
//   emptyIconWrap: {
//     width: 88,
//     height: 88,
//     borderRadius: 44,
//     backgroundColor: V.forestMid,
//     borderWidth: 1.5,
//     borderColor: V.borderGreen,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   emptyText: {
//     fontSize: T.lead,
//     color: V.silverDim,
//     textAlign: "center",
//     paddingHorizontal: 32,
//   },

//   // ── Comments ─────────────────────────────────────────────────────────────────
//   commentRow: {
//     flexDirection: "row",
//     marginBottom: 16,
//     gap: 12,
//     paddingBottom: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: V.borderDim, // ← #304A28
//     alignItems: "flex-start",
//   },
//   commentUser: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: V.silverBright,
//     marginBottom: 4,
//   },
//   commentText: {
//     fontSize: T.body,
//     color: V.silver,
//     lineHeight: 20,
//     marginBottom: 4,
//   },
//   commentDate: {
//     fontSize: T.caption,
//     color: V.silverDim,
//   },

//   // ── Input row — identičan ag.inputRow u dashboard ────────────────────────────
//   inputRow: {
//     flexDirection: "row",
//     padding: 12,
//     borderTopWidth: 1,
//     borderTopColor: V.borderDim, // ← #304A28, identičan ag.inputRow
//     gap: 8,
//     alignItems: "flex-end",
//     backgroundColor: V.forestDeep, // ← #1A2E15
//     paddingBottom: Platform.OS === "ios" ? 28 : 12,
//   },
//   textInput: {
//     flex: 1,
//     backgroundColor: V.forestMid, // ← #243B1E, identičan ag.input
//     borderRadius: 22,
//     borderWidth: 1,
//     borderColor: V.borderGreen, // ← #4A7040
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     maxHeight: 100,
//     fontSize: T.body,
//     color: V.silverBright,
//   },
//   sendBtn: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     backgroundColor: V.forestLight, // ← #2D5518, identičan ag.sendBtn
//     borderWidth: 1.5,
//     borderColor: V.borderGreen,
//     justifyContent: "center",
//     alignItems: "center",
//     flexShrink: 0,
//   },
//   sendBtnDisabled: {
//     backgroundColor: V.borderDim,
//     borderColor: V.borderDim,
//   },

//   // ── Recipient row ─────────────────────────────────────────────────────────────
//   recipientRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingHorizontal: 16,
//     paddingVertical: 14,
//     borderBottomWidth: 1,
//     borderBottomColor: V.borderDim,
//     backgroundColor: V.forestDeep,
//   },
//   recipientName: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: V.silverBright,
//   },
//   recipientSub: {
//     fontSize: T.meta,
//     color: V.silverDim,
//     marginTop: 2,
//   },

//   // ── Quick replies — identične ag.dmQuickBtn ───────────────────────────────────
//   quickRow: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: 8,
//     paddingHorizontal: 16,
//     paddingVertical: 12,
//     backgroundColor: V.forestMid,
//     borderBottomWidth: 1,
//     borderBottomColor: V.borderDim,
//   },
//   quickChip: {
//     backgroundColor: V.forestDeep, // ← identičan ag.dmQuickBtn
//     borderRadius: 18,
//     borderWidth: 1,
//     borderColor: V.borderDim,
//     paddingHorizontal: 12,
//     paddingVertical: 7,
//   },
//   quickChipText: {
//     fontSize: T.meta,
//     color: V.silver,
//     fontWeight: "600",
//   },

//   // ── Share — search bar ────────────────────────────────────────────────────────
//   // Identičan dashboard filter panelu
//   searchBar: {
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: V.forestMid,
//     borderRadius: 12,
//     borderWidth: 1.5,
//     borderColor: V.borderGreen,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.3,
//     shadowRadius: 4,
//     elevation: 4,
//   },
//   searchInput: {
//     flex: 1,
//     fontSize: T.body,
//     color: V.silverBright,
//   },

//   // ── User row (Share lista) ────────────────────────────────────────────────────
//   userRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: 12,
//     paddingHorizontal: 4,
//     borderBottomWidth: 1,
//     borderBottomColor: V.borderDim,
//     backgroundColor: V.forestDeep,
//     gap: 0,
//   },
//   shareIconWrap: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: V.forestMid,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//     justifyContent: "center",
//     alignItems: "center",
//   },
// });

// // ─── Upload modal stilovi ─────────────────────────────────────────────────────
// const upload = StyleSheet.create({
//   pickContainer: {
//     alignItems: "center",
//     gap: 20,
//     paddingTop: 40,
//   },
//   pickHint: {
//     fontSize: T.lead,
//     color: V.silverDim,
//     marginBottom: 8,
//   },
//   pickIconWrap: {
//     width: 80,
//     height: 80,
//     borderRadius: 40,
//     backgroundColor: V.forestMid,
//     borderWidth: 1.5,
//     borderColor: V.borderGreen,
//     justifyContent: "center",
//     alignItems: "center",
//     marginBottom: 8,
//   },
//   pickBtn: {
//     width: "85%",
//     alignItems: "center",
//     padding: 24,
//     borderRadius: 16,
//     borderWidth: 1.5,
//     borderColor: V.borderGreen,
//     borderStyle: "dashed",
//     gap: 4,
//     backgroundColor: V.forestMid,
//   },
//   pickBtnText: {
//     fontSize: T.lead,
//     color: V.visited,
//     fontWeight: "700",
//   },
//   pickBtnSub: {
//     fontSize: T.meta,
//     color: V.silverDim,
//   },
//   previewContainer: {
//     position: "relative",
//     marginBottom: 20,
//   },
//   previewMedia: {
//     width: "100%",
//     height: 260,
//     borderRadius: 12,
//   },
//   mediaTypeBadge: {
//     position: "absolute",
//     top: 10,
//     left: 10,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 4,
//     backgroundColor: V.overlay,
//     paddingHorizontal: 10,
//     paddingVertical: 5,
//     borderRadius: 20,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//   },
//   mediaTypeBadgeText: {
//     color: V.silver,
//     fontSize: T.meta,
//     fontWeight: "600",
//   },
//   changeBtn: {
//     position: "absolute",
//     bottom: 10,
//     right: 10,
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: V.overlay,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 20,
//     borderWidth: 1,
//     borderColor: V.borderDim,
//   },
//   fieldLabel: {
//     fontSize: T.body,
//     fontWeight: "700",
//     color: V.silver,
//     marginBottom: 8,
//     marginTop: 14,
//     textTransform: "uppercase",
//     letterSpacing: 0.5,
//   },
//   fieldInput: {
//     backgroundColor: V.forestMid,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//     paddingHorizontal: 16,
//     paddingVertical: 12,
//     fontSize: T.body,
//     color: V.silverBright,
//   },
//   actionBtn: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     borderRadius: 12,
//     paddingVertical: 16,
//     gap: 8,
//     borderWidth: 1.5,
//   },
//   actionBtnText: {
//     color: V.silverBright,
//     fontSize: T.body,
//     fontWeight: "700",
//   },
// });

// OBRISATI: const modal = StyleSheet.create({ ... })
// OBRISATI: const upload = StyleSheet.create({ ... })

function makeModalStyles(VT: ReturnType<typeof getVT>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 20,
      paddingTop: Platform.OS === "ios" ? 54 : 36,
      borderBottomWidth: 1.5,
      borderBottomColor: VT.borderBright,
      backgroundColor: VT.bg,
    },
    headerTitle: {
      fontSize: T.title,
      fontWeight: "800",
      color: VT.textPrimary,
    },
    closeTxt: { fontSize: T.body, fontWeight: "600", color: VT.textMuted },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: VT.bgCard,
      borderWidth: 1.5,
      borderColor: VT.borderBright,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyText: {
      fontSize: T.lead,
      color: VT.textMuted,
      textAlign: "center",
      paddingHorizontal: 32,
    },
    commentRow: {
      flexDirection: "row",
      marginBottom: 16,
      gap: 12,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: VT.border,
      alignItems: "flex-start",
    },
    commentUser: {
      fontSize: T.body,
      fontWeight: "700",
      color: VT.textPrimary,
      marginBottom: 4,
    },
    commentText: {
      fontSize: T.body,
      color: VT.textSecondary,
      lineHeight: 20,
      marginBottom: 4,
    },
    commentDate: { fontSize: T.caption, color: VT.textMuted },
    inputRow: {
      flexDirection: "row",
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: VT.border,
      gap: 8,
      alignItems: "flex-end",
      backgroundColor: VT.bg,
      paddingBottom: Platform.OS === "ios" ? 28 : 12,
    },
    textInput: {
      flex: 1,
      backgroundColor: VT.bgCard,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: VT.borderBright,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxHeight: 100,
      fontSize: T.body,
      color: VT.textPrimary,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: VT.bgLight,
      borderWidth: 1.5,
      borderColor: VT.borderBright,
      justifyContent: "center",
      alignItems: "center",
      flexShrink: 0,
    },
    sendBtnDisabled: { backgroundColor: VT.border, borderColor: VT.border },
    recipientRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: VT.border,
      backgroundColor: VT.bg,
    },
    recipientName: {
      fontSize: T.body,
      fontWeight: "700",
      color: VT.textPrimary,
    },
    recipientSub: { fontSize: T.meta, color: VT.textMuted, marginTop: 2 },
    quickRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: VT.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: VT.border,
    },
    quickChip: {
      backgroundColor: VT.bg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: VT.border,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    quickChipText: {
      fontSize: T.meta,
      color: VT.textSecondary,
      fontWeight: "600",
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: VT.bgCard,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: VT.borderBright,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: T.body, color: VT.textPrimary },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: VT.border,
      backgroundColor: VT.bg,
    },
    shareIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: VT.bgCard,
      borderWidth: 1,
      borderColor: VT.borderBright,
      justifyContent: "center",
      alignItems: "center",
    },
  });
}

function makeUploadStyles(VT: ReturnType<typeof getVT>) {
  return StyleSheet.create({
    pickContainer: { alignItems: "center", gap: 20, paddingTop: 40 },
    pickHint: { fontSize: T.lead, color: VT.textMuted, marginBottom: 8 },
    pickIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: VT.bgCard,
      borderWidth: 1.5,
      borderColor: VT.borderBright,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    pickBtn: {
      width: "85%",
      alignItems: "center",
      padding: 24,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: VT.borderBright,
      borderStyle: "dashed",
      gap: 4,
      backgroundColor: VT.bgCard,
    },
    pickBtnText: { fontSize: T.lead, color: VT.accent, fontWeight: "700" },
    pickBtnSub: { fontSize: T.meta, color: VT.textMuted },
    previewContainer: { position: "relative", marginBottom: 20 },
    previewMedia: { width: "100%", height: 260, borderRadius: 12 },
    mediaTypeBadge: {
      position: "absolute",
      top: 10,
      left: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: VT.overlay,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: VT.borderBright,
    },
    mediaTypeBadgeText: {
      color: VT.textSecondary,
      fontSize: T.meta,
      fontWeight: "600",
    },
    changeBtn: {
      position: "absolute",
      bottom: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: VT.overlay,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: VT.border,
    },
    eventRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: VT.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: VT.borderBright,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: 16,
    },
    eventLabel: { fontSize: T.body, fontWeight: "700", color: VT.textPrimary },
    eventHint: {
      fontSize: T.meta,
      lineHeight: 16,
      color: VT.textMuted,
      marginTop: 2,
    },
    fieldLabel: {
      fontSize: T.body,
      fontWeight: "700",
      color: VT.textSecondary,
      marginBottom: 8,
      marginTop: 14,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    fieldInput: {
      backgroundColor: VT.bgCard,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: VT.borderBright,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: T.body,
      color: VT.textPrimary,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      paddingVertical: 16,
      gap: 8,
      borderWidth: 1.5,
    },
    actionBtnText: {
      color: VT.textPrimary,
      fontSize: T.body,
      fontWeight: "700",
    },
  });
}
