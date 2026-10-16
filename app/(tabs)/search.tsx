// app/(tabs)/search.tsx — VARA tema (usklađena s dashboard.tsx)
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StoryBadge } from "../../app/StoryBadge";
import { useTheme } from "../../components/AdaptiveThemeProvider";
import { API_BASE_URL, API_ENDPOINTS } from "../config/api";

const PRESET_AVATARS: Record<string, any> = {
  "avatar:male": require("../../assets/images/avatar-male.png"),
  "avatar:female": require("../../assets/images/avatar-female.png"),
};

// ─── VARA paleta ─────────────────────────────────────────────────────────────
//
// Imena su ostala lokalna (bg, textPrimary, accent…) jer ih koristi cijeli
// ovaj ekran, ali VRIJEDNOSTI dolaze iz sustava boja. Prije su bile
// prepisane i tiho su zaostale: pozadina je ovdje bila #1a2e1a, a u
// varaTheme #1A2E15 — dvije različite zelene u istoj ulozi.
//
// `accent` se ovdje gotovo uvijek koristi kao TEKST (korisničko ime, gumb
// "Pratim", ikone), a stara vrijednost je na tamnoj podlozi davala omjer
// 3.56 — ispod praga čitljivosti. Zato ide na accentText; jedini obrub
// koji ga je koristio dobiva punu zelenu preko borderActive.
import { getVara } from "../../styles/adaptiveVara";
import { T, V as VARA } from "../../styles/varaTheme";
import { StateView } from "../../components/StateView";

const V = {
  bg: VARA.forestDeep,
  bgCard: "#2A4230",
  bgCardHover: "#3A5A30",
  border: "#3A5A30",
  borderBright: VARA.borderGreen,
  borderActive: VARA.visited,
  textPrimary: "#E8E8E8",
  textSecondary: "#C0C0C0",
  textMuted: VARA.silverDim,
  textDisabled: "#B0B0B0",
  accent: VARA.accentText,
  inputBg: "#2A4230",
  inputBorder: VARA.borderGreen,
  placeholder: VARA.silverDim,
} as const;

interface User {
  id: number;
  firstname?: string;
  lastname?: string;
  firstName?: string;
  lastName?: string;
  username: string;
  avatar?: string | null;
  followersCount?: number;
  isFollowing?: boolean;
}

function getV(dark: boolean) {
  // Ista imena kao gore, vrijednosti iz zajedničke prilagodljive palete.
  const A = getVara(dark);
  return {
    bg: A.forestDeep,
    bgCard: A.forestMid,
    bgCardHover: A.forestLight,
    border: A.borderDim,
    borderBright: A.borderGreen,
    borderActive: A.visited,
    textPrimary: A.silverBright,
    textSecondary: A.silver,
    textMuted: A.silverDim,
    textDisabled: A.silverDim,
    accent: A.accentText,
    inputBg: A.inputBg,
    inputBorder: A.borderGreen,
    placeholder: A.silverDim,
  } as const;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function buildAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("http://") || avatar.startsWith("https://"))
    return avatar;
  const path = avatar.startsWith("/") ? avatar : `/${avatar}`;
  return `${API_BASE_URL}${path}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function VaraAvatar({
  avatar,
  firstName,
  lastName,
  size,
  V,
}: {
  avatar?: string | null;
  firstName: string;
  lastName: string;
  size: number;
  V: ReturnType<typeof getV>;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
  const r = size / 2;

  // Preset avatar (avatar:male / avatar:female)
  if (avatar && PRESET_AVATARS[avatar]) {
    return (
      <Image
        source={PRESET_AVATARS[avatar]}
        style={{ width: size, height: size, borderRadius: r }}
        resizeMode="cover"
      />
    );
  }

  // URL avatar
  if (avatar && !avatar.startsWith("avatar:") && !failed) {
    const url =
      avatar.startsWith("http://") || avatar.startsWith("https://")
        ? avatar
        : `${API_BASE_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
    const urlWithCache = `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;

    return (
      <Image
        source={{ uri: urlWithCache }}
        style={{ width: size, height: size, borderRadius: r }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback – inicijali
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: V.bgCard,
        borderWidth: 1.5,
        borderColor: V.borderBright,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: V.textPrimary,
          fontSize: size * 0.36,
          fontWeight: "700",
        }}
      >
        {initials || "?"}
      </Text>
    </View>
  );
}

// ─── Compose Message Modal — dashboard stil ───────────────────────────────────
function ComposeMessageModal({
  visible,
  recipient,
  onClose,
  V,
}: {
  visible: boolean;
  recipient: User | null;
  onClose: () => void;
  V: ReturnType<typeof getV>;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!recipient || !message.trim()) return;
    setSending(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/message/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: recipient.id,
          content: message.trim(),
        }),
      });
      if (res.ok) {
        Alert.alert(
          t("common.success"),
          t("search.messageSent", { username: recipient.username }),
        );
        setMessage("");
        onClose();
      } else {
        const err = await res.text();
        Alert.alert(t("common.error"), err || t("search.messageFailed"));
      }
    } catch {
      Alert.alert(t("common.error"), t("search.messageFailedCheckConnection"));
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setMessage("");
    onClose();
  };

  if (!recipient) return null;
  const firstName = recipient.firstname || recipient.firstName || "";
  const lastName = recipient.lastname || recipient.lastName || "";

  const QUICK = ["Hej! 👋", "Kako si?", "Vidimo se uskoro!", "Odlično! 🔥"];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: V.bg }}
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
        {/* ── Header — identičan dashboard modalima ── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 20,
            paddingTop: Platform.OS === "ios" ? 54 : 36,
            borderBottomWidth: 1.5,
            borderBottomColor: V.borderBright,
            backgroundColor: V.bg,
          }}
        >
          <Text
            style={{
              fontSize: T.title,
              fontWeight: "800",
              color: V.textPrimary,
            }}
          >
            {t("search.sendMessage")}
          </Text>
          <TouchableOpacity onPress={handleClose}>
            <Text
              style={{
                fontSize: T.body,
                color: V.textDisabled,
                fontWeight: "600",
              }}
            >
              {t("common.close")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Primatelj ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: V.border,
            backgroundColor: V.bg,
          }}
        >
          <Text
            style={{ fontSize: T.body, fontWeight: "600", color: V.textMuted }}
          >
            {t("search.messageTo")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 6,
              gap: 8,
              backgroundColor: V.bgCard,
              borderWidth: 1,
              borderColor: V.borderBright,
            }}
          >
            <VaraAvatar
              avatar={
                recipient.avatar
                  ? recipient.avatar.startsWith("avatar:")
                    ? recipient.avatar
                    : recipient.avatar.startsWith("http")
                      ? `${recipient.avatar}${recipient.avatar.includes("?") ? "&" : "?"}_t=${recipient.id}`
                      : `${API_BASE_URL}${recipient.avatar.startsWith("/") ? "" : "/"}${recipient.avatar}?_t=${recipient.id}`
                  : null
              }
              firstName={firstName}
              lastName={lastName}
              size={28}
              V={V}
            />
            <Text
              style={{ fontSize: T.body, fontWeight: "600", color: V.accent }}
            >
              @{recipient.username}
            </Text>
          </View>
        </View>

        {/* ── Textarea ── */}
        <View style={{ flex: 1, padding: 16, backgroundColor: V.bg }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: V.inputBg,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: V.inputBorder,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: T.body,
              color: V.textPrimary,
              textAlignVertical: "top",
            }}
            placeholder={t("search.messagePlaceholder", { name: firstName })}
            placeholderTextColor={V.placeholder}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
            autoFocus
          />
          <Text
            style={{
              fontSize: T.meta,
              textAlign: "right",
              marginTop: 6,
              color: V.textMuted,
            }}
          >
            {message.length}/1000
          </Text>
        </View>

        {/* ── Quick replies ── */}
        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: V.border,
            backgroundColor: V.bgCard,
          }}
        >
          <Text
            style={{ fontSize: T.meta, marginBottom: 10, color: V.textMuted }}
          >
            {t("search.quickMessages")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {QUICK.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={{
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    backgroundColor: V.bgCardHover,
                    borderWidth: 1,
                    borderColor: V.borderBright,
                  }}
                  onPress={() => setMessage(q)}
                >
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: V.textSecondary,
                      fontWeight: "600",
                    }}
                  >
                    {q}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ── Pošalji gumb ── */}
        <TouchableOpacity
          style={{
            margin: 16,
            backgroundColor: V.bgCardHover,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: V.borderActive,
            paddingVertical: 16,
            alignItems: "center",
            opacity: !message.trim() || sending ? 0.5 : 1,
          }}
          onPress={send}
          disabled={!message.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color={V.textPrimary} />
          ) : (
            <Text
              style={{
                color: V.textPrimary,
                fontSize: T.lead,
                fontWeight: "700",
              }}
            >
              {t("search.sendBtn")}
            </Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Search Screen ────────────────────────────────────────────────────────
export default function SearchScreen() {
  const { t } = useTranslation();
  const { isDark } = useTheme(); // ← DODATI
  const V = useMemo(() => getV(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(V), [V]);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [followingMap, setFollowingMap] = useState<Record<number, boolean>>({});
  const [pendingMap, setPendingMap] = useState<Record<number, boolean>>({});
  const [loadingFollow, setLoadingFollow] = useState<Record<number, boolean>>(
    {},
  );
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [composeTarget, setComposeTarget] = useState<User | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = async (silent = false) => {
    try {
      const token = await AsyncStorage.getItem("token");
      const storedId = await AsyncStorage.getItem("userId");
      const parsedId = parseInt(storedId || "0");
      if (storedId) setCurrentUserId(parsedId);

      // Tri zahtjeva idu ISTOVREMENO. Prije su se izvršavali jedan za drugim
      // (await pa await pa await), pa se čekanje zbrajalo — na sporijoj vezi
      // je to bila razlika između jednog i tri puna kruga do servera prije
      // nego se ekran uopće prikaže.
      const [res, followRes, pendingRes] = await Promise.all([
        fetch(API_ENDPOINTS.USERS, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/follow/following/${parsedId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        // Korisnici s privatnim profilom ne prate se odmah — ovo označava
        // koje smo zahtjeve već poslali pa gumb ne izgleda kao da još
        // uvijek ništa nismo poduzeli.
        fetch(`${API_BASE_URL}/api/follow/requests/sent`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      // Odgovor koji nije `ok` prije se preskakao — popis je ostajao prazan
      // bez ijedne riječi objašnjenja.
      if (!res.ok) throw new Error(String(res.status));
      {
        const data: User[] = await res.json();
        const others = data.filter(
          (u) =>
            u.id !== parsedId &&
            u.username?.toLowerCase() !== "admin_cromap" &&
            `${u.firstname || u.firstName || ""} ${u.lastname || u.lastName || ""}`
              .toLowerCase()
              .trim() !== "admin cromap",
        );
        setUsers(others);
        setFiltered(others);
      }
      try {
        if (followRes?.ok) {
          const following = await followRes.json();
          const map: Record<number, boolean> = {};
          following.forEach((u: any) => {
            map[u.id] = true;
          });
          setFollowingMap(map);
        }
      } catch {}
      try {
        if (pendingRes?.ok) {
          const ids: number[] = await pendingRes.json();
          const map: Record<number, boolean> = {};
          ids.forEach((id) => {
            map[id] = true;
          });
          setPendingMap(map);
        }
      } catch {}
      setLoadFailed(false);
    } catch {
      // Tiho osvježavanje ne smije zbrisati popis koji je već na ekranu.
      if (!silent) setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Osvježi stanje svaki put kad se korisnik vrati na pretragu. Bez ovoga
  // pošiljatelj nikad ne bi doznao ishod svog zahtjeva: ako ga primatelj
  // odbije, zahtjev nestaje u bazi, ali gumb bi ovdje zauvijek pisao
  // "Zatraženo". Sad se nakon odbijanja vrati na "Prati", a nakon
  // prihvaćanja na "Praćenje".
  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, []),
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      if (!query.trim()) {
        setFiltered(users);
        return;
      }
      const q = query.toLowerCase();
      setFiltered(
        users.filter(
          (u) =>
            u.username?.toLowerCase().includes(q) ||
            u.firstName?.toLowerCase().includes(q) ||
            u.lastName?.toLowerCase().includes(q),
        ),
      );
    }, 200);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, users]);

  const handleFollow = async (userId: number) => {
    const token = await AsyncStorage.getItem("token");
    const isFollowing = followingMap[userId];
    const isPending = pendingMap[userId];
    setLoadingFollow((p) => ({ ...p, [userId]: true }));

    try {
      if (isPending) {
        // Otkaži poslani zahtjev za praćenje
        setPendingMap((p) => ({ ...p, [userId]: false }));
        const res = await fetch(
          `${API_BASE_URL}/api/follow/request/${userId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) throw new Error(`Status ${res.status}`);
      } else if (isFollowing) {
        setFollowingMap((p) => ({ ...p, [userId]: false }));
        const res = await fetch(`${API_BASE_URL}/api/follow/${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
      } else {
        const res = await fetch(`${API_BASE_URL}/api/follow/${userId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json().catch(() => ({}));
        if (data.pending) {
          setPendingMap((p) => ({ ...p, [userId]: true }));
          // Pošiljatelj dosad nije dobio nikakvu potvrdu — gumb bi samo
          // promijenio natpis, pa se nije znalo je li zahtjev uopće poslan.
          // (Zahtjev nastaje samo kad je profil primatelja privatan; javni
          // profil se zaprati odmah, bez odobravanja.)
          const target = users.find((u) => u.id === userId);
          const targetName =
            `${target?.firstname || target?.firstName || ""} ${
              target?.lastname || target?.lastName || ""
            }`.trim() ||
            target?.username ||
            "";
          Alert.alert(
            t("follow.requestSentTitle"),
            t("follow.requestSentMessage", { name: targetName }),
          );
        } else {
          setFollowingMap((p) => ({ ...p, [userId]: true }));
        }
      }
    } catch (e: any) {
      setFollowingMap((p) => ({ ...p, [userId]: isFollowing }));
      setPendingMap((p) => ({ ...p, [userId]: isPending }));
      const isRateLimited = e?.message?.includes("429");
      Alert.alert(
        t("common.error"),
        isRateLimited ? t("common.tooManyRequests") : t("search.followFailed"),
      );
    } finally {
      setLoadingFollow((p) => ({ ...p, [userId]: false }));
    }
  };

  const renderUser = ({ item }: { item: User }) => {
    const firstName = item.firstname || item.firstName || "";
    const lastName = item.lastname || item.lastName || "";
    const isFollowing = followingMap[item.id] || false;
    const isPending = pendingMap[item.id] || false;
    const isLoadingThis = loadingFollow[item.id] || false;

    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() =>
          router.push({
            pathname: "/profile/[userId]",
            params: { userId: item.id.toString() },
          } as any)
        }
        activeOpacity={0.75}
      >
        {/* Avatar */}
        <StoryBadge userId={item.id} size={54}>
          <VaraAvatar
            avatar={item.avatar}
            firstName={firstName}
            lastName={lastName}
            size={54}
            V={V}
          />
        </StoryBadge>

        {/* Info */}
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {firstName} {lastName}
          </Text>
          <Text style={styles.userUsername}>@{item.username}</Text>
          {item.followersCount !== undefined && (
            <Text style={styles.followersCount}>
              {t("search.followers", { count: item.followersCount })}
            </Text>
          )}
        </View>

        {/* Akcije */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.followBtn,
              (isFollowing || isPending) && styles.followingBtn,
            ]}
            onPress={() => handleFollow(item.id)}
            disabled={isLoadingThis}
          >
            {isLoadingThis ? (
              <ActivityIndicator
                size="small"
                color={isFollowing || isPending ? V.accent : V.textPrimary}
              />
            ) : (
              <Text
                style={[
                  styles.followBtnText,
                  (isFollowing || isPending) && styles.followingBtnText,
                ]}
              >
                {isFollowing
                  ? t("search.following")
                  : isPending
                    ? t("userProfile.requested")
                    : t("search.follow")}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.msgBtn}
            onPress={() => {
              setComposeTarget(item);
              setShowCompose(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.send")}
          >
            <Ionicons name="paper-plane-outline" size={18} color={V.accent} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("search.title")}</Text>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search-outline"
            size={18}
            color={V.placeholder}
            style={{ marginRight: 8 }}
          />
          <TextInput
            selectTextOnFocus
            style={styles.searchInput}
            placeholder={t("search.placeholder")}
            placeholderTextColor={V.placeholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Ionicons name="close-circle" size={18} color={V.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Broj rezultata ── */}
      {!loading && query.length > 0 && (
        <Text style={styles.resultsInfo}>
          {t("search.results", { count: filtered.length })}
        </Text>
      )}

      {/* ── Lista ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={V.accent} />
          <Text style={styles.loadingText}>{t("search.loading")}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderUser}
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyList : styles.listContent
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData(true);
              }}
              tintColor={V.accent}
            />
          }
          ListEmptyComponent={
            loadFailed ? (
              <StateView
                tone="error"
                title={t("common.loadFailedTitle")}
                body={t("common.loadFailedBody")}
                onRetry={() => loadData()}
                retrying={loading}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons
                    name="people-outline"
                    size={44}
                    color={V.borderBright}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {query ? t("search.noResults") : t("search.noUsers")}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {query
                    ? t("search.noResultsDesc", { query })
                    : t("search.noUsersDesc")}
                </Text>
              </View>
            )
          }
        />
      )}

      <ComposeMessageModal
        visible={showCompose}
        recipient={composeTarget}
        onClose={() => {
          setShowCompose(false);
          setComposeTarget(null);
        }}
        V={V}
      />
    </View>
  );
}

// OBRISATI statični const styles = StyleSheet.create({ ... })

// DODATI factory funkciju
function makeStyles(V: ReturnType<typeof getV>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: V.bg },
    header: {
      padding: 20,
      paddingTop: Platform.OS === "ios" ? 54 : 36,
      borderBottomWidth: 1.5,
      borderBottomColor: V.borderBright,
      backgroundColor: V.bg,
    },
    headerTitle: { fontSize: T.title, fontWeight: "800", color: V.textPrimary },
    searchBarWrap: { padding: 16 },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: V.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: V.inputBorder,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: T.body, color: V.textPrimary },
    resultsInfo: {
      fontSize: T.meta,
      paddingHorizontal: 20,
      marginBottom: 4,
      color: V.textMuted,
    },
    listContent: { paddingHorizontal: 12, paddingBottom: 100 },
    emptyList: { flex: 1 },
    userCard: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: V.border,
      backgroundColor: V.bg,
      gap: 12,
    },
    userInfo: { flex: 1, gap: 2 },
    userName: { fontSize: T.body, fontWeight: "700", color: V.textPrimary },
    userUsername: { fontSize: T.meta, color: V.accent },
    followersCount: { fontSize: T.meta, color: V.textMuted, marginTop: 1 },
    actions: { flexDirection: "row", alignItems: "center", gap: 8 },
    followBtn: {
      backgroundColor: V.bgCardHover,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: V.borderBright,
      paddingHorizontal: 14,
      paddingVertical: 7,
      minWidth: 78,
      alignItems: "center",
    },
    followingBtn: { backgroundColor: "transparent", borderColor: V.accent },
    followBtnText: {
      color: V.textPrimary,
      fontSize: T.meta,
      fontWeight: "600",
    },
    followingBtnText: { color: V.accent },
    msgBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: V.bgCard,
      borderWidth: 1,
      borderColor: V.borderBright,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
    },
    loadingText: { fontSize: T.body, color: V.textMuted },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      gap: 14,
    },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: V.bgCard,
      borderWidth: 1.5,
      borderColor: V.borderBright,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyTitle: {
      fontSize: T.title,
      fontWeight: "700",
      color: V.textSecondary,
    },
    emptySubtitle: {
      fontSize: T.body,
      textAlign: "center",
      color: V.textMuted,
      paddingHorizontal: 32,
    },
  });
}

// ─── Stilovi — 1:1 s dashboard paletom ────────────────────────────────────────
// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: V.bg },

//   // Header — identičan dashboard modalima
//   header: {
//     padding: 20,
//     paddingTop: Platform.OS === "ios" ? 54 : 36,
//     borderBottomWidth: 1.5,
//     borderBottomColor: V.borderBright,
//     backgroundColor: V.bg,
//   },
//   headerTitle: { fontSize: T.title, fontWeight: "800", color: V.textPrimary },

//   // Search bar — identičan dashboard filter inputu
//   searchBarWrap: { padding: 16 },
//   searchBar: {
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: V.inputBg,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: V.inputBorder,
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//   },
//   searchInput: { flex: 1, fontSize: T.body, color: V.textPrimary },

//   resultsInfo: {
//     fontSize: T.meta,
//     paddingHorizontal: 20,
//     marginBottom: 4,
//     color: V.textMuted,
//   },

//   // List
//   listContent: { paddingHorizontal: 12, paddingBottom: 100 },
//   emptyList: { flex: 1 },

//   // User card — identičan dashboard grupnim karticama
//   userCard: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: 12,
//     paddingHorizontal: 12,
//     borderBottomWidth: 1,
//     borderBottomColor: V.border,
//     backgroundColor: V.bg,
//     gap: 12,
//   },

//   userInfo: { flex: 1, gap: 2 },
//   userName: { fontSize: T.body, fontWeight: "700", color: V.textPrimary },
//   userUsername: { fontSize: T.meta, color: V.accent },
//   followersCount: { fontSize: T.meta, color: V.textMuted, marginTop: 1 },

//   // Akcijski gumbi — dashboard stil
//   actions: { flexDirection: "row", alignItems: "center", gap: 8 },

//   followBtn: {
//     backgroundColor: V.bgCardHover,
//     borderRadius: 20,
//     borderWidth: 1.5,
//     borderColor: V.borderBright,
//     paddingHorizontal: 14,
//     paddingVertical: 7,
//     minWidth: 78,
//     alignItems: "center",
//   },
//   followingBtn: {
//     backgroundColor: "transparent",
//     borderColor: V.accent,
//   },
//   followBtnText: { color: V.textPrimary, fontSize: T.meta, fontWeight: "600" },
//   followingBtnText: { color: V.accent },

//   msgBtn: {
//     width: 38,
//     height: 38,
//     borderRadius: 19,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: V.bgCard,
//     borderWidth: 1,
//     borderColor: V.borderBright,
//   },

//   // Loading
//   center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
//   loadingText: { fontSize: T.body, color: V.textMuted },

//   // Empty state
//   emptyContainer: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//     paddingTop: 80,
//     gap: 14,
//   },
//   emptyIconWrap: {
//     width: 88,
//     height: 88,
//     borderRadius: 44,
//     backgroundColor: V.bgCard,
//     borderWidth: 1.5,
//     borderColor: V.borderBright,
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   emptyTitle: { fontSize: T.title, fontWeight: "700", color: V.textSecondary },
//   emptySubtitle: {
//     fontSize: T.body,
//     textAlign: "center",
//     color: V.textMuted,
//     paddingHorizontal: 32,
//   },
// });
