import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/AdaptiveThemeProvider";
import {
  Message,
  getConversationMessages,
  getCurrentUserId,
  markAsRead,
  sendMessage,
} from "../../utils/messagesApi";
import { API_BASE_URL } from "../config/api";
import i18n from "../config/i18n";
import { useActivePolling } from "@/hooks/use-active-polling";
import { useKeyboardOverlap } from "@/hooks/use-keyboard-offset";
import { CloseButton } from "@/components/CloseButton";
import { T } from "../../styles/varaTheme";

// ─── VARA Paleta ───────────────────────────────────────────────────────────────
function getV(isDark: boolean) {
  return {
    forestDeep: isDark ? "#1A2E15" : "#f0ede4",
    forestMid: isDark ? "#243B1E" : "#e4ead8",
    forestLight: isDark ? "#2D5518" : "#3a6a28",
    borderGreen: isDark ? "#4A7040" : "#5a8a40",
    borderDim: isDark ? "#304A28" : "#c0d0a8",
    silver: isDark ? "#C4CABC" : "#3a4a35",
    silverBright: isDark ? "#E8EDE4" : "#1a2a18",
    silverDim: isDark ? "#8A9486" : "#5a6a55",
    accentGold: isDark ? "#B8A060" : "#8a6a20",
    visited: isDark ? "#5A8A48" : "#2D6418",
    danger: isDark ? "#8B3030" : "#cc2222",
    overlay: isDark ? "rgba(10,20,8,0.88)" : "rgba(240,237,228,0.88)",
  } as const;
}

// ─── Video Share Format ────────────────────────────────────────────────────────
export const VIDEO_PREFIX = "__CROMAP_VIDEO__";

export interface VideoSharePayload {
  id: number;
  title: string;
  url: string;
}

export function parseVideoMessage(content: string): VideoSharePayload | null {
  if (!content?.startsWith(VIDEO_PREFIX)) return null;
  try {
    return JSON.parse(content.slice(VIDEO_PREFIX.length));
  } catch {
    return null;
  }
}

// UKLONI cijeli vbStyles StyleSheet.create blok i zamijeni VideoBubble s ovim:
function VideoBubble({ url, onPress }: { url: string; onPress?: () => void }) {
  const { isDark } = useTheme();
  const V = useMemo(() => getV(isDark), [isDark]);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View
        style={{
          width: 240,
          height: 160,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#000",
          borderWidth: 1,
          borderColor: V.borderGreen,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="play" size={24} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MediaPreviewVideo({ uri }: { uri: string }) {
  const { isDark } = useTheme();
  const V = useMemo(() => getV(isDark), [isDark]);
  const styles = useMemo(() => getStyles(V, isDark), [V, isDark]);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    return () => {
      try {
        player?.pause();
      } catch {}
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.previewMedia}
      contentFit="contain"
      nativeControls
    />
  );
}

// ─── Image Bubble ──────────────────────────────────────────────────────────────
// ZAMIJENI postojeći ImageBubble:
function ImageBubble({ url, onPress }: { url: string; onPress?: () => void }) {
  const { isDark } = useTheme();
  const V = useMemo(() => getV(isDark), [isDark]);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View
        style={{
          width: 200,
          height: 200,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: V.forestMid,
          borderWidth: 1,
          borderColor: V.borderGreen,
        }}
      >
        <Image
          source={{ uri: url }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>
    </TouchableOpacity>
  );
}

function parseImageMessage(content: string): string | null {
  if (!content?.startsWith("__CROMAP_IMAGE__")) return null;
  try {
    const data = JSON.parse(content.slice("__CROMAP_IMAGE__".length));
    return data.url;
  } catch {
    return null;
  }
}

// ─── Zumabilna slika (pinch-to-zoom + pomicanje) ──────────────────────────────
function ZoomableImage({ uri }: { uri: string }) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Animated.Value.setOffset/flattenOffset kombiniraju vrijednosti
  // ZBRAJANJEM, a zumiranje se sastavlja MNOŽENJEM — stari kod je to
  // pomiješao (setOffset(lastScale) + setValue(1) + flattenOffset dâ
  // lastScale + 1, ne lastScale), pa je slika pri svakom otpuštanju prstiju
  // neočekivano skočila veća. Zato se "potvrđeni" zoom (baseScale) i zoom
  // trenutne geste (pinchScale, uvijek počinje od 1) drže odvojeno i množe.
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);

  // refs za povezivanje gesta da rade ISTOVREMENO umjesto da se otimaju
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  // izračun maksimalno dozvoljenog pomaka na temelju trenutnog zooma,
  // tako da rub slike nikad ne prijeđe rub ekrana (nema crnog prostora)
  // Uz resizeMode="cover" slika UVIJEK točno popunjava kontejner, pa je
  // njena prikazana veličina jednaka veličini kontejnera — granica pomaka
  // je zato točno (veličina * (zoom - 1)) / 2 i rub slike nikad ne može
  // otkriti pozadinu iza sebe.
  const getBounds = () => {
    const s = lastScale.current;
    const maxX = Math.max(0, (containerSize.width * (s - 1)) / 2);
    const maxY = Math.max(0, (containerSize.height * (s - 1)) / 2);
    return { maxX, maxY };
  };

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      lastScale.current = Math.max(1, Math.min(lastScale.current, 5));
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);

      if (lastScale.current <= 1) {
        lastTranslateX.current = 0;
        lastTranslateY.current = 0;
        translateX.setOffset(0);
        translateY.setOffset(0);
        translateX.setValue(0);
        translateY.setValue(0);
      } else {
        // nakon zooma, odmah stisni postojeći pomak unutar novih granica
        const { maxX, maxY } = getBounds();
        lastTranslateX.current = clamp(lastTranslateX.current, -maxX, maxX);
        lastTranslateY.current = clamp(lastTranslateY.current, -maxY, maxY);
        translateX.setOffset(lastTranslateX.current);
        translateY.setOffset(lastTranslateY.current);
        translateX.setValue(0);
        translateY.setValue(0);
      }
    }
  };

  const onPanEvent = Animated.event(
    [
      {
        nativeEvent: {
          translationX: translateX,
          translationY: translateY,
        },
      },
    ],
    { useNativeDriver: true },
  );

  const onPanStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { maxX, maxY } = getBounds();

      const rawX = lastTranslateX.current + event.nativeEvent.translationX;
      const rawY = lastTranslateY.current + event.nativeEvent.translationY;

      lastTranslateX.current = clamp(rawX, -maxX, maxX);
      lastTranslateY.current = clamp(rawY, -maxY, maxY);

      translateX.setOffset(lastTranslateX.current);
      translateX.setValue(0);
      translateY.setOffset(lastTranslateY.current);
      translateY.setValue(0);
    }
  };

  // Dvostruki dodir sada prebacuje između uvećano/normalno (kao u
  // Instagramu/Twitteru) umjesto da uvijek samo vraća na 1x — pincanje
  // dvama prstima je nespretno na manjim ekranima, ovo je brži način
  // za uvećati sliku.
  const onDoubleTap = () => {
    const nextScale = lastScale.current > 1.01 ? 1 : 2.5;
    lastScale.current = nextScale;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
    Animated.parallel([
      Animated.spring(baseScale, { toValue: nextScale, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start(() => {
      baseScale.setValue(nextScale);
      pinchScale.setValue(1);
      translateX.setOffset(0);
      translateX.setValue(0);
      translateY.setOffset(0);
      translateY.setValue(0);
    });
  };

  const lastTap = useRef(0);
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) onDoubleTap();
    lastTap.current = now;
  };

  return (
    <View
      style={{ flex: 1, width: "100%", height: "100%" }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize({ width, height });
      }}
    >
      <PanGestureHandler
        ref={panRef}
        simultaneousHandlers={pinchRef}
        onGestureEvent={onPanEvent}
        onHandlerStateChange={onPanStateChange}
        minPointers={1}
        maxPointers={2}
        avgTouches
      >
        <Animated.View style={{ flex: 1, width: "100%", height: "100%" }}>
          <PinchGestureHandler
            ref={pinchRef}
            simultaneousHandlers={panRef}
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}
          >
            <Animated.View
              style={{ flex: 1, width: "100%", height: "100%" }}
              onTouchEnd={handleTap}
            >
              <Animated.Image
                source={{ uri }}
                style={{
                  width: "100%",
                  height: "100%",
                  transform: [{ scale }, { translateX }, { translateY }],
                }}
                // ✅ FIX: bio je "contain" — taj način namjerno uklapa
                // CIJELU sliku unutar ekrana, pa kad omjer slike ne
                // odgovara omjeru ekrana (gotovo uvijek), sa strane ili
                // gore/dolje ostane vidljiva pozadina aplikacije. To su
                // one trake oko slike (prije crne, sad zelene). "cover"
                // umjesto toga popunjava cijeli ekran, pa se pozadina
                // nikad ne vidi — ni u mirovanju ni pri zumiranju.
                resizeMode="cover"
              />
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

// ─── Fullscreen video player — zasebna komponenta, remounta se po URL-u ──────
function FullscreenVideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    return () => {
      try {
        player?.pause();
      } catch {}
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      contentFit="contain"
      nativeControls
    />
  );
}

// ─── Fullscreen Media Viewer ───────────────────────────────────────────────────
function FullscreenMediaViewer({
  media,
  onClose,
}: {
  media: { type: "image" | "video"; url: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!media}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Fiksna tamnozelena umjesto čiste crne — bilo koji preostali,
            očekivani "contain" rub (kad omjer slike ne odgovara točno
            ekranu) sad se barem uklapa u VARA temu umjesto da izgleda
            kao slučajna crna greška. */}
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0D2406" }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              padding: 16,
            }}
          >
            <CloseButton onPress={onClose} tone="onBlack" />
          </View>
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            {media?.type === "image" && <ZoomableImage uri={media.url} />}
            {media?.type === "video" && (
              <FullscreenVideoPlayer key={media.url} url={media.url} />
            )}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Helper: ispravna konstrukcija avatar URL-a ────────────────────────────────
function buildAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("http://") || avatar.startsWith("https://"))
    return avatar;
  // osiguraj da ima vodeću kosu crtu
  const path = avatar.startsWith("/") ? avatar : `/${avatar}`;
  return `${API_BASE_URL}${path}`;
}

// ─── Inicijali ────────────────────────────────────────────────────────────────
const getInitials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();

// ─── Avatar komponenta s fallback-om ──────────────────────────────────────────
// ─── Avatar komponenta s fallback-om ──────────────────────────────────────────
const PRESET_AVATARS_CHAT: Record<string, any> = {
  "avatar:male": require("../../assets/images/avatar-male.png"),
  "avatar:female": require("../../assets/images/avatar-female.png"),
};

function AvatarCircle({
  avatarUrl,
  initials,
  size,
  style,
}: {
  avatarUrl: string | null;
  initials: string;
  size: number;
  style?: any;
}) {
  const { isDark } = useTheme();
  const V = useMemo(() => getV(isDark), [isDark]);
  const [failed, setFailed] = useState(false);
  const r = size / 2;

  if (avatarUrl && PRESET_AVATARS_CHAT[avatarUrl]) {
    return (
      <Image
        source={PRESET_AVATARS_CHAT[avatarUrl]}
        style={[{ width: size, height: size, borderRadius: r }, style]}
        resizeMode="cover"
      />
    );
  }
  if (avatarUrl && !failed) {
    return (
      <Image
        source={{ uri: avatarUrl, cache: "reload" }}
        style={[{ width: size, height: size, borderRadius: r }, style]}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: V.forestLight,
          borderWidth: 1.5,
          borderColor: V.borderGreen,
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      <Text
        style={{
          color: V.silverBright,
          fontSize: size * 0.35,
          fontWeight: "700",
        }}
      >
        {initials || "?"}
      </Text>
    </View>
  );
}

// ─── Chat Screen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const V = useMemo(() => getV(isDark), [isDark]);
  const styles = useMemo(() => getStyles(V, isDark), [V, isDark]);
  const { userId, name } = useLocalSearchParams<{
    userId: string;
    name?: string;
  }>();
  const otherUserId = parseInt(userId ?? "0", 10);
  const displayName = name ?? `User_${userId}`;

  const [otherUserInfo, setOtherUserInfo] = useState<{
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  } | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{
    uri: string;
    type: "image" | "video";
  } | null>(null);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    type: "image" | "video";
    url: string;
  } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // ─── Dohvat info o drugom korisniku ─────────────────────────────────────────
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const res = await fetch(
          `${API_BASE_URL}/api/auth/users/${otherUserId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const userData = await res.json();

          // Provjeri sva moguća polja (case-insensitive)
          const raw =
            userData.Avatar ||
            userData.avatar ||
            userData.avatarUrl ||
            userData.profileImage ||
            userData.photo ||
            null;
          let avatarUrl: string | null = null;

          if (raw && raw.trim() !== "" && raw !== "null") {
            if (raw.startsWith("avatar:")) {
              avatarUrl = raw; // proslijedi "avatar:male" / "avatar:female"
            } else if (
              raw.startsWith("http://") ||
              raw.startsWith("https://")
            ) {
              avatarUrl = `${raw}${raw.includes("?") ? "&" : "?"}_t=${Date.now()}`;
            } else {
              avatarUrl = `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}?_t=${Date.now()}`;
            }
          }

          setOtherUserInfo({
            firstName: userData.firstName || userData.FirstName || "",
            lastName: userData.lastName || userData.LastName || "",
            avatarUrl,
          });
        }
      } catch (e) {
        console.error("Error fetching user info:", e);
      }
    };
    if (otherUserId) fetchUserInfo();
  }, [otherUserId]);

  // ─── Odabir medija ───────────────────────────────────────────────────────────
  const pickMedia = async (source: "gallery" | "camera") => {
    const perm =
      source === "gallery"
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("media.permissionNeeded"), t("media.permissionBody"));
      return;
    }
    const result =
      source === "gallery"
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            quality: 0.8,
          })
        : await ImagePicker.launchCameraAsync({
            mediaTypes: ["images", "videos"],
            quality: 0.8,
          });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMediaPreview({
        uri: asset.uri,
        type: asset.type === "video" ? "video" : "image",
      });
      setShowMediaPreview(true);
    }
  };

  // ─── Upload i slanje medija ──────────────────────────────────────────────────
  const sendMedia = async () => {
    if (!mediaPreview) return;
    setSendingMedia(true);
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert(t("common.error"), t("auth.notSignedIn"));
        return;
      }

      const formData = new FormData();
      formData.append("file", {
        uri: mediaPreview.uri,
        type: mediaPreview.type === "video" ? "video/mp4" : "image/jpeg",
        name:
          mediaPreview.type === "video" ? "chat_video.mp4" : "chat_image.jpg",
      } as any);

      const uploadRes = await fetch(`${API_BASE_URL}/api/upload/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const rawText = await uploadRes.text();
      if (!uploadRes.ok) {
        console.error("Upload failed:", uploadRes.status, rawText);
        throw new Error(rawText || "Upload failed");
      }

      const uploadData = JSON.parse(rawText);
      const mediaUrl = uploadData.url;
      if (!mediaUrl) throw new Error("Backend nije vratio url medija");

      const mediaContent =
        mediaPreview.type === "video"
          ? `${VIDEO_PREFIX}${JSON.stringify({ id: Date.now(), title: "Video", url: mediaUrl })}`
          : `__CROMAP_IMAGE__${JSON.stringify({ url: mediaUrl })}`;

      const { ok, rateLimited } = await sendMessage(otherUserId, mediaContent);
      if (ok) {
        setMediaPreview(null);
        setShowMediaPreview(false);
        await loadMessages(true);
      } else if (rateLimited) {
        Alert.alert(
          "Prebrzo",
          "Previše zahtjeva u kratkom vremenu. Pričekaj malo pa pokušaj ponovo.",
        );
      } else {
        Alert.alert(t("common.error"), t("media.sentButMessageFailed"));
      }
    } catch (e: any) {
      console.error("Send media error:", e?.message ?? e);
      Alert.alert(t("common.error"), t("media.sendFailed"));
    } finally {
      setSendingMedia(false);
    }
  };

  // ─── Dohvat poruka ───────────────────────────────────────────────────────────
  const loadMessages = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const msgs = await getConversationMessages(otherUserId);
        msgs.sort(
          (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
        );
        setMessages(msgs);
        const unread = msgs.filter((m) => m.receiverId === myId && !m.isRead);
        unread.forEach((m) => markAsRead(m.id).catch(() => {}));
      } catch {
        if (!silent) setError("Greška pri učitavanju razgovora.");
      } finally {
        setLoading(false);
      }
    },
    [otherUserId, myId],
  );

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserId();
      setMyId(id);
    })();
  }, []);

  useEffect(() => {
    if (myId === null) return;
    loadMessages();
  }, [myId, loadMessages]);

  // Osvježavanje razgovora staje kad aplikacija ode u pozadinu — inače je
  // otvoren chat slao zahtjev svake 4 sekunde i s ugašenim ekranom.
  useActivePolling(() => loadMessages(true), 4000, myId !== null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }
  }, [messages.length]);

  // ─── Slanje poruke ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    const optimisticMsg: Message = {
      id: Date.now(),
      senderId: myId!,
      receiverId: otherUserId,
      content: text,
      isRead: false,
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText("");
    setSending(true);
    try {
      const { ok, rateLimited } = await sendMessage(otherUserId, text);
      if (!ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setInputText(text);
        setError(
          rateLimited
            ? "Previše zahtjeva u kratkom vremenu. Pričekaj malo pa pokušaj ponovo."
            : "Poruka nije poslana. Pokušaj ponovo.",
        );
      } else {
        await loadMessages(true);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInputText(text);
      setError("Poruka nije poslana. Provjeri konekciju.");
    } finally {
      setSending(false);
    }
  };

  // ─── Formatiranje ────────────────────────────────────────────────────────────
  const formatTime = (sentAt: string) => {
    const date = new Date(sentAt);
    const now = new Date();
    if (date.toDateString() === now.toDateString())
      return date.toLocaleTimeString("hr-HR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    return date.toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateSeparator = (sentAt: string) => {
    const date = new Date(sentAt);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString()) return t("chat.today");
    if (date.toDateString() === yesterday.toDateString())
      return t("chat.yesterday");
    const locale = i18n.language === "hr" ? "hr-HR" : "en-US"; // ← nova linija
    return date.toLocaleDateString(locale, {
      // ← locale umjesto "hr-HR"
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  };

  // ─── Render poruke ────────────────────────────────────────────────────────────
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.senderId === myId;
    const videoPayload = parseVideoMessage(item.content);
    const imageUrl = parseImageMessage(item.content);
    const prev = index > 0 ? messages[index - 1] : null;

    const showDateSep =
      !prev ||
      new Date(item.sentAt).toDateString() !==
        new Date(prev.sentAt).toDateString();
    const prevSameSender =
      prev &&
      prev.senderId === item.senderId &&
      Math.abs(
        new Date(item.sentAt).getTime() - new Date(prev.sentAt).getTime(),
      ) <
        60 * 1000;
    const showTime =
      !messages[index + 1] ||
      messages[index + 1].senderId !== item.senderId ||
      Math.abs(
        new Date(messages[index + 1].sentAt).getTime() -
          new Date(item.sentAt).getTime(),
      ) >
        60 * 1000;

    const initials = otherUserInfo
      ? getInitials(otherUserInfo.firstName, otherUserInfo.lastName)
      : (displayName?.[0]?.toUpperCase() ?? "?");

    return (
      <>
        {showDateSep && (
          <View style={styles.dateSep}>
            <View style={styles.dateSepLine} />
            <Text style={styles.dateSepText}>
              {formatDateSeparator(item.sentAt)}
            </Text>
            <View style={styles.dateSepLine} />
          </View>
        )}
        <View
          style={[
            styles.msgRow,
            isMine ? styles.msgRowRight : styles.msgRowLeft,
            prevSameSender && { marginTop: 2 },
          ]}
        >
          {/* Avatar za primljene poruke */}
          {!isMine && (
            <View
              style={[styles.msgAvatarWrap, prevSameSender && styles.hidden]}
            >
              <AvatarCircle
                key={`msg-avatar-${otherUserInfo?.avatarUrl ?? "no"}`}
                avatarUrl={otherUserInfo?.avatarUrl ?? null}
                initials={initials}
                size={30}
              />
            </View>
          )}

          <View
            style={[
              isMine ? styles.outgoing : styles.incomingGroup,
              (videoPayload || imageUrl) && { maxWidth: "85%" },
            ]}
          >
            {videoPayload && (
              <VideoBubble
                url={videoPayload.url}
                onPress={() =>
                  setFullscreenMedia({ type: "video", url: videoPayload.url })
                }
              />
            )}
            {!videoPayload && imageUrl && (
              <ImageBubble
                url={imageUrl}
                onPress={() =>
                  setFullscreenMedia({ type: "image", url: imageUrl })
                }
              />
            )}
            {!videoPayload && !imageUrl && (
              <View
                style={[
                  styles.bubble,
                  isMine ? styles.bubbleMine : styles.bubbleOther,
                ]}
              >
                <Text
                  style={
                    isMine ? styles.bubbleTextMine : styles.bubbleTextOther
                  }
                >
                  {item.content}
                </Text>
              </View>
            )}
            {showTime && (
              <View
                style={[
                  styles.timeRow,
                  isMine ? styles.timeRowRight : styles.timeRowLeft,
                ]}
              >
                <Text style={styles.timeText}>{formatTime(item.sentAt)}</Text>
                {isMine && (
                  <Ionicons
                    name={item.isRead ? "checkmark-done" : "checkmark"}
                    size={12}
                    color={item.isRead ? V.visited : V.silverDim}
                    style={{ marginLeft: 3 }}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      </>
    );
  };

  const headerInitials = otherUserInfo
    ? getInitials(otherUserInfo.firstName, otherUserInfo.lastName)
    : (displayName?.[0]?.toUpperCase() ?? "?");

  // Tipkovnica ne smije prekriti polje za unos: mjeri se koliko stvarno prekriva
  // dno ovog prikaza i toliko se podigne (vidi hooks/use-keyboard-offset).
  const keyboardAreaRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(keyboardAreaRef);

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={26} color={V.silver} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AvatarCircle
            key={otherUserInfo?.avatarUrl ?? "no-avatar"}
            avatarUrl={otherUserInfo?.avatarUrl ?? null}
            initials={headerInitials}
            size={40}
          />
          <View>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.headerStatus}>{t("chat.activeUser")}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {error && (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={() => setError(null)}
        >
          <Ionicons name="warning-outline" size={14} color="#ff3b30" />
          <Text style={styles.errorText}>{error}</Text>
          <Ionicons name="close" size={14} color="#ff3b30" />
        </TouchableOpacity>
      )}

      <View
        ref={keyboardAreaRef}
        collapsable={false}
        style={{ flex: 1, paddingBottom: keyboardOverlap }}
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
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={V.visited} />
              <Text style={styles.loadingText}>Učitavanje razgovora...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderMessage}
              contentContainerStyle={[
                styles.messagesList,
                messages.length === 0 && styles.emptyList,
              ]}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: false })
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={56}
                    color={V.borderGreen}
                  />
                  <Text style={styles.emptyTitle}>Nema poruka</Text>
                  <Text style={styles.emptySubtitle}>
                    Pošalji prvu poruku korisniku {displayName}!
                  </Text>
                </View>
              }
            />
          )}

          {/* ── Input area ── */}
          <View style={styles.inputArea}>
            <TouchableOpacity
              style={styles.mediaBtn}
              onPress={() => pickMedia("gallery")}
              disabled={sendingMedia}
              accessibilityRole="button"
              accessibilityLabel={t("media.attach")}
            >
              <Ionicons name="images-outline" size={22} color={V.visited} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mediaBtn}
              onPress={() => pickMedia("camera")}
              disabled={sendingMedia}
            >
              <Ionicons name="camera-outline" size={22} color={V.visited} />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={t("chat.messagePlaceholder", { name: displayName })}
              placeholderTextColor={V.silverDim}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!inputText.trim() && !mediaPreview) || sending
                  ? styles.sendBtnDisabled
                  : null,
              ]}
              onPress={
                inputText.trim() ? handleSend : () => pickMedia("gallery")
              }
              disabled={(!inputText.trim() && !mediaPreview) || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={V.silverBright} />
              ) : (
                <Ionicons
                  name={inputText.trim() ? "send" : "send-outline"}
                  size={18}
                  color={V.silverBright}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* ── Media Preview Modal ── */}
      <Modal
        visible={showMediaPreview}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowMediaPreview(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.previewHeader}>
            <CloseButton
              onPress={() => setShowMediaPreview(false)}
              tone="onBlack"
            />
            <Text style={styles.previewTitle}>Pregled</Text>
            <TouchableOpacity
              style={styles.previewSendBtn}
              onPress={sendMedia}
              disabled={sendingMedia}
            >
              {sendingMedia ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.previewSendBtnText}>Pošalji</Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.previewContainer}>
            {mediaPreview?.type === "video" && mediaPreview.uri ? (
              <MediaPreviewVideo uri={mediaPreview.uri} />
            ) : (
              <Image
                source={{ uri: mediaPreview?.uri }}
                style={styles.previewMedia}
                resizeMode="contain"
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Fullscreen Media Viewer (klik na sliku/video u chatu) ── */}
      <FullscreenMediaViewer
        media={fullscreenMedia}
        onClose={() => setFullscreenMedia(null)}
      />
    </SafeAreaView>
  );
}

// ─── Stilovi — VARA tema ──────────────────────────────────────────────────────
const BUBBLE_RADIUS = 16;

// const styles = StyleSheet.create({
//   safeArea: { flex: 1, backgroundColor: V.forestDeep },

//   // Header
//   header: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingHorizontal: 8,
//     paddingVertical: 10,
//     borderBottomWidth: 1.5,
//     borderBottomColor: V.borderGreen,
//     backgroundColor: V.forestDeep,
//   },
//   backBtn: { padding: 8 },
//   headerCenter: {
//     flex: 1,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 10,
//     marginLeft: 4,
//   },
//   headerName: {
//     fontSize: T.lead,
//     fontWeight: "700",
//     color: V.silverBright,
//     maxWidth: 180,
//   },
//   headerStatus: { fontSize: T.meta, color: V.silverDim, marginTop: 1 },

//   // Error
//   errorBanner: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//     backgroundColor: "#2A1010",
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     borderBottomWidth: 1,
//     borderBottomColor: "#5A2A2A",
//   },
//   errorText: { fontSize: T.meta, color: "#ff3b30", flex: 1 },

//   // Messages list
//   messagesList: {
//     padding: 12,
//     paddingBottom: 8,
//     backgroundColor: V.forestDeep,
//   },
//   emptyList: {
//     flex: 1,
//     justifyContent: "center",
//     backgroundColor: V.forestDeep,
//   },

//   // Date separator
//   dateSep: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginVertical: 16,
//     gap: 10,
//   },
//   dateSepLine: {
//     flex: 1,
//     height: StyleSheet.hairlineWidth,
//     backgroundColor: V.borderDim,
//   },
//   dateSepText: { fontSize: T.meta, color: V.silverDim, fontWeight: "500" },

//   // Message row
//   msgRow: { flexDirection: "row", marginVertical: 3, alignItems: "flex-end" },
//   msgRowLeft: { justifyContent: "flex-start" },
//   msgRowRight: { justifyContent: "flex-end" },
//   msgAvatarWrap: { marginRight: 6, flexShrink: 0 },
//   hidden: { opacity: 0 },

//   // Bubble containers
//   outgoing: { alignItems: "flex-end", maxWidth: "75%" },
//   incomingGroup: { alignItems: "flex-start", maxWidth: "75%" },

//   // Bubbles
//   bubble: {
//     borderRadius: BUBBLE_RADIUS,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//   },
//   bubbleMine: {
//     backgroundColor: V.forestLight,
//     borderBottomRightRadius: 4,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//   },
//   bubbleOther: {
//     backgroundColor: V.forestMid,
//     borderBottomLeftRadius: 4,
//     borderWidth: 1,
//     borderColor: V.borderDim,
//   },
//   bubbleTextMine: { color: V.silverBright, fontSize: T.body, lineHeight: 21 },
//   bubbleTextOther: { color: V.silver, fontSize: T.body, lineHeight: 21 },

//   // Time
//   timeRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
//   timeRowRight: { justifyContent: "flex-end" },
//   timeRowLeft: { justifyContent: "flex-start" },
//   timeText: { fontSize: T.caption, color: V.silverDim },

//   // Empty state
//   emptyState: { alignItems: "center", paddingHorizontal: 48, gap: 12 },
//   emptyTitle: { fontSize: T.title, fontWeight: "700", color: V.silverDim },
//   emptySubtitle: {
//     fontSize: T.body,
//     color: V.silverDim,
//     textAlign: "center",
//     lineHeight: 20,
//   },

//   // Loading
//   center: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     gap: 12,
//     backgroundColor: V.forestDeep,
//   },
//   loadingText: { color: V.silverDim, fontSize: T.body },

//   // Input area
//   inputArea: {
//     flexDirection: "row",
//     alignItems: "flex-end",
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//     borderTopWidth: 1.5,
//     borderTopColor: V.borderGreen,
//     backgroundColor: V.forestDeep,
//     gap: 8,
//   },
//   mediaBtn: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: V.forestMid,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//   },
//   textInput: {
//     flex: 1,
//     minHeight: 42,
//     maxHeight: 120,
//     backgroundColor: V.forestMid,
//     borderRadius: 21,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     fontSize: T.body,
//     color: V.silverBright,
//     lineHeight: 20,
//   },
//   sendBtn: {
//     width: 42,
//     height: 42,
//     borderRadius: 21,
//     backgroundColor: V.forestLight,
//     borderWidth: 1.5,
//     borderColor: V.borderGreen,
//     justifyContent: "center",
//     alignItems: "center",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.4,
//     shadowRadius: 4,
//     elevation: 3,
//   },
//   sendBtnDisabled: {
//     backgroundColor: V.borderDim,
//     borderColor: V.borderDim,
//     shadowOpacity: 0,
//   },

//   // Preview modal
//   previewHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     padding: 16,
//     backgroundColor: "#000",
//   },
//   previewTitle: { fontSize: T.lead, fontWeight: "600", color: "#fff" },
//   previewSendBtn: {
//     backgroundColor: V.forestLight,
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     borderRadius: 20,
//     borderWidth: 1,
//     borderColor: V.borderGreen,
//   },
//   previewSendBtnText: { color: V.silverBright, fontWeight: "600" },
//   previewContainer: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#000",
//   },
//   previewMedia: { width: "100%", height: "100%" },
// });

// Finalna verzija funkcije:
const getStyles = (V: ReturnType<typeof getV>, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: V.forestDeep },

    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderBottomWidth: 1.5,
      borderBottomColor: V.borderGreen,
      backgroundColor: V.forestDeep,
    },
    backBtn: { padding: 8 },
    headerCenter: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: 4,
    },
    headerName: {
      fontSize: T.lead,
      fontWeight: "700",
      color: V.silverBright,
      maxWidth: 180,
    },
    headerStatus: { fontSize: T.meta, color: V.silverDim, marginTop: 1 },

    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: isDark ? "#2A1010" : "#fde8e8",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#5A2A2A" : "#f0b0b0",
    },
    errorText: { fontSize: T.meta, color: "#ff3b30", flex: 1 },

    messagesList: {
      padding: 12,
      paddingBottom: 8,
      backgroundColor: V.forestDeep,
    },
    emptyList: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: V.forestDeep,
    },

    dateSep: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 16,
      gap: 10,
    },
    dateSepLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: V.borderDim,
    },
    dateSepText: { fontSize: T.meta, color: V.silverDim, fontWeight: "500" },

    msgRow: { flexDirection: "row", marginVertical: 3, alignItems: "flex-end" },
    msgRowLeft: { justifyContent: "flex-start" },
    msgRowRight: { justifyContent: "flex-end" },
    msgAvatarWrap: { marginRight: 6, flexShrink: 0 },
    hidden: { opacity: 0 },

    outgoing: { alignItems: "flex-end", maxWidth: "75%" },
    incomingGroup: { alignItems: "flex-start", maxWidth: "75%" },

    bubble: {
      borderRadius: BUBBLE_RADIUS,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleMine: {
      backgroundColor: V.forestLight,
      borderBottomRightRadius: 4,
      borderWidth: 1,
      borderColor: V.borderGreen,
    },
    bubbleOther: {
      backgroundColor: V.forestMid,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: V.borderDim,
    },
    bubbleTextMine: { color: V.silverBright, fontSize: T.body, lineHeight: 21 },
    bubbleTextOther: { color: V.silver, fontSize: T.body, lineHeight: 21 },

    timeRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
    timeRowRight: { justifyContent: "flex-end" },
    timeRowLeft: { justifyContent: "flex-start" },
    timeText: { fontSize: T.caption, color: V.silverDim },

    emptyState: { alignItems: "center", paddingHorizontal: 48, gap: 12 },
    emptyTitle: { fontSize: T.title, fontWeight: "700", color: V.silverDim },
    emptySubtitle: {
      fontSize: T.body,
      color: V.silverDim,
      textAlign: "center",
      lineHeight: 20,
    },

    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      backgroundColor: V.forestDeep,
    },
    loadingText: { color: V.silverDim, fontSize: T.body },

    inputArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1.5,
      borderTopColor: V.borderGreen,
      backgroundColor: V.forestDeep,
      gap: 8,
    },
    mediaBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: V.forestMid,
      borderWidth: 1,
      borderColor: V.borderGreen,
    },
    textInput: {
      flex: 1,
      minHeight: 42,
      maxHeight: 120,
      backgroundColor: V.forestMid,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: V.borderGreen,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: T.body,
      color: V.silverBright,
      lineHeight: 20,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: V.forestLight,
      borderWidth: 1.5,
      borderColor: V.borderGreen,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    sendBtnDisabled: {
      backgroundColor: V.borderDim,
      borderColor: V.borderDim,
      shadowOpacity: 0,
    },

    previewHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      backgroundColor: "#000",
    },
    previewTitle: { fontSize: T.lead, fontWeight: "600", color: "#fff" },
    previewSendBtn: {
      backgroundColor: V.forestLight,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: V.borderGreen,
    },
    previewSendBtnText: { color: V.silverBright, fontWeight: "600" },
    previewContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
    },
    previewMedia: { width: "100%", height: "100%" },
  });
