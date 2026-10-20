// app/profile/[userId].tsx
// Pregled profila drugog korisnika
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MediaPager, PagerItem } from "@/components/MediaPager";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StoryBadge } from "../../app/StoryBadge";
import { useTheme } from "../../components/AdaptiveThemeProvider";
import { API_BASE_URL } from "../config/api";
import { getVara } from "../../styles/adaptiveVara";
import { T } from "../../styles/varaTheme";
import { getToken } from "@/utils/tokenStore";

const PRESET_AVATARS: Record<string, any> = {
  "avatar:male": require("../../assets/images/avatar-male.png"),
  "avatar:female": require("../../assets/images/avatar-female.png"),
};

const { width: SCREEN_W } = Dimensions.get("window");

interface PublicProfile {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  avatar?: string | null;
  followersCount: number;
  followingCount: number;
  isPublic: boolean;
}

interface PublicMedia {
  id: number;
  title: string;
  filePath: string;
  createdAt: string;
  mediaType: "image" | "video";
  likeCount?: number;
  // Ovo se prije odbacivalo pri mapiranju, pa je pregled objave mogao
  // pokazati samo sliku — bez mjesta, kategorija i datuma događaja.
  location?: string | null;
  additionalDescription?: string | null;
  isEvent?: boolean;
  eventStartAt?: string | null;
}

// Video Preview Modal komponenta
function VideoPreviewModal({
  visible,
  videoUrl,
  title,
  onClose,
}: {
  visible: boolean;
  videoUrl: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const playerRef = useRef<any>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = false;
    playerRef.current = p;
    setIsPlayerReady(true);
  });

  useEffect(() => {
    if (!player) return;

    if (visible && isPlayerReady) {
      setTimeout(() => {
        if (playerRef.current) {
          try {
            playerRef.current.play();
          } catch (e) {
            console.log("Error playing video:", e);
          }
        }
      }, 100);
    } else if (!visible && playerRef.current) {
      try {
        playerRef.current.pause();
      } catch (e) {
        console.log("Error pausing video:", e);
      }
    }
  }, [visible, player, isPlayerReady]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          if (typeof playerRef.current.release === "function") {
            playerRef.current.release();
          }
        } catch (e) {
          console.log("Error cleaning up video player:", e);
        }
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={vpModal.header}>
          <TouchableOpacity onPress={onClose}>
            <Text
              style={{ color: "#c0c0c0", fontSize: T.body, fontWeight: "600" }}
            >
              {t("common.close")}
            </Text>
          </TouchableOpacity>
          <Text style={vpModal.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={vpModal.videoContainer}>
          {visible && (
            <VideoView
              player={player}
              style={vpModal.video}
              contentFit="contain"
              nativeControls={true}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const vpModal = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#000",
  },
  title: {
    fontSize: T.lead,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    marginHorizontal: 12,
    textAlign: "center",
  },
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
});

// Image Preview Modal
function ImagePreviewModal({
  visible,
  imageUrl,
  title,
  onClose,
}: {
  visible: boolean;
  imageUrl: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 16,
            backgroundColor: "#000",
          }}
        >
          <TouchableOpacity onPress={onClose}>
            <Text
              style={{ color: "#c0c0c0", fontSize: T.body, fontWeight: "600" }}
            >
              {t("common.close")}
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              fontSize: T.lead,
              fontWeight: "600",
              color: "#fff",
              flex: 1,
              marginHorizontal: 12,
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#000",
          }}
        >
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function UserProfileScreen() {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const V = useMemo(() => getVara(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(V), [V]);
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const numericUserId = parseInt(userId ?? "0");

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [media, setMedia] = useState<PublicMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequestPending, setIsRequestPending] = useState(false);
  // Neke fotografije (uglavnom snimljene prije migracije na Cloudflare R2)
  // više ne postoje na serveru — bez ovoga bi <Image> ostao prazan umjesto
  // da se prikažu inicijali.
  const [imageFailed, setImageFailed] = useState(false);
  const [isGolden, setIsGolden] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [pagerOpen, setPagerOpen] = useState(false);
  const [pagerIndex, setPagerIndex] = useState(0);
  const [goldenLoading, setGoldenLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // State za medij pregled

  useEffect(() => {
    if (!numericUserId) return;
    loadProfile();
  }, [numericUserId]);

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.avatar]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const token = await getToken();

      // 1. Dohvati profil korisnika
      const res = await fetch(
        `${API_BASE_URL}/api/auth/users/${numericUserId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      let profileData: PublicProfile = {
        id: numericUserId,
        firstName: "",
        lastName: "",
        username: "",
        avatar: null,
        followersCount: 0,
        followingCount: 0,
        isPublic: true,
      };

      if (res.ok) {
        const data = await res.json();
        profileData = {
          ...profileData,
          ...data,
        };
      }

      // 2. Dohvati broj pratitelja i praćenih
      try {
        const [followersRes, followingRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/follow/followers/${numericUserId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/api/follow/following/${numericUserId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (followersRes.ok) {
          const followers = await followersRes.json();
          profileData.followersCount = followers.length || 0;
        }
        if (followingRes.ok) {
          const following = await followingRes.json();
          profileData.followingCount = following.length || 0;
        }
      } catch (error) {
        console.error("Error fetching follow counts:", error);
      }

      setProfile(profileData);

      // 3. Dohvati sve medije korisnika
      const videosRes = await fetch(
        `${API_BASE_URL}/api/video/user/${numericUserId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      let allMedia: PublicMedia[] = [];

      if (videosRes.ok) {
        const videos = await videosRes.json();
        console.log("Media loaded:", videos.length);

        allMedia = videos.map((v: any) => ({
          id: v.id,
          title: v.title || (v.mediaType === "image" ? "Slika" : "Video"),
          filePath: v.filePath,
          createdAt: v.createdAt,
          mediaType: v.mediaType === "image" ? "image" : "video",
          likeCount: v.likeCount || 0,
          location: v.location,
          additionalDescription: v.additionalDescription,
          isEvent: v.isEvent,
          eventStartAt: v.eventStartAt,
        }));
      }

      allMedia.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      setMedia(allMedia);

      // 4-6. Provjere follow, golden, block...
      try {
        const fRes = await fetch(
          `${API_BASE_URL}/api/follow/is-following/${numericUserId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (fRes.ok) {
          const data = await fRes.json();
          setIsFollowing(data.isFollowing ?? false);
        }
      } catch {}

      try {
        const rRes = await fetch(
          `${API_BASE_URL}/api/follow/request-status/${numericUserId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (rRes.ok) {
          const data = await rRes.json();
          setIsRequestPending(data.pending ?? false);
        }
      } catch {}

      try {
        const gRes = await fetch(
          `${API_BASE_URL}/api/golden-friends/is-golden/${numericUserId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (gRes.ok) {
          const data = await gRes.json();
          setIsGolden(data.isGolden ?? false);
        }
      } catch {}

      try {
        const bRes = await fetch(
          `${API_BASE_URL}/api/block/is-blocked/${numericUserId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (bRes.ok) {
          const data = await bRes.json();
          setIsBlocked(data.isBlocked ?? false);
        }
      } catch {}
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  // Follow / Unfollow / zahtjev za praćenje (privatni profili)
  const handleFollow = async () => {
    const token = await getToken();
    setFollowLoading(true);

    // Napomena: ranije su ovi pozivi ciljali /api/follow/follow/{id} i
    // /api/follow/unfollow/{id}, koji ne postoje na backendu (stvarne rute
    // su POST/DELETE /api/follow/{id}) — svaki follow/unfollow s ovog ekrana
    // je tiho propao (404) i optimistička promjena se odmah vraćala natrag.

    if (isRequestPending) {
      // Otkaži poslani zahtjev za praćenje
      setIsRequestPending(false);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/follow/request/${numericUserId}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error();
      } catch {
        setIsRequestPending(true);
      } finally {
        setFollowLoading(false);
      }
      return;
    }

    const prev = isFollowing;
    setIsFollowing(!prev);
    if (profile && prev) {
      // Odmah smanji brojač samo za unfollow — za follow ne znamo unaprijed
      // hoće li ovo postati stvarni follow ili tek zahtjev na čekanju.
      setProfile((p) =>
        p ? { ...p, followersCount: p.followersCount - 1 } : p,
      );
    }
    try {
      if (prev) {
        const res = await fetch(`${API_BASE_URL}/api/follow/${numericUserId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch(`${API_BASE_URL}/api/follow/${numericUserId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error();
        const data = await res.json().catch(() => ({}));
        if (data.pending) {
          // Privatan profil — zahtjev poslan, ne prati se odmah
          setIsFollowing(false);
          setIsRequestPending(true);
        } else {
          setProfile((p) =>
            p ? { ...p, followersCount: p.followersCount + 1 } : p,
          );
        }
      }
    } catch {
      setIsFollowing(prev);
      if (!prev) {
        // pokušaj follow-a nije uspio, ništa nije promijenjeno na serveru
      } else {
        setProfile((p) =>
          p ? { ...p, followersCount: p.followersCount + 1 } : p,
        );
      }
    } finally {
      setFollowLoading(false);
    }
  };

  // Golden Star toggle
  const handleGoldenToggle = async () => {
    const token = await getToken();
    setGoldenLoading(true);
    try {
      if (!isGolden) {
        Alert.alert(
          t("userProfile.addGolden"),
          t("userProfile.addGoldenDesc", {
            name: `${profile?.firstName} ${profile?.lastName}`,
          }),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("userProfile.addGoldenBtn"),
              onPress: async () => {
                const res = await fetch(
                  `${API_BASE_URL}/api/golden-friends/add/${numericUserId}`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                  },
                );
                if (res.ok) {
                  setIsGolden(true);
                  Alert.alert(
                    "⭐",
                    t("userProfile.goldenAdded", {
                      name: profile?.firstName ?? "",
                    }),
                  );
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(
          t("userProfile.removeGolden"),
          t("userProfile.removeGoldenDesc", { name: profile?.firstName ?? "" }),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.remove"),
              style: "destructive",
              onPress: async () => {
                const res = await fetch(
                  `${API_BASE_URL}/api/golden-friends/remove/${numericUserId}`,
                  {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                  },
                );
                if (res.ok) setIsGolden(false);
              },
            },
          ],
        );
      }
    } catch {
    } finally {
      setGoldenLoading(false);
    }
  };

  // Block / Unblock
  const handleBlock = async () => {
    const token = await getToken();
    if (!isBlocked) {
      Alert.alert(
        t("userProfile.blockUser"),
        t("userProfile.blockUserDesc", {
          name: `${profile?.firstName} ${profile?.lastName}`,
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("userProfile.blockBtn"),
            style: "destructive",
            onPress: async () => {
              const res = await fetch(
                `${API_BASE_URL}/api/block/block/${numericUserId}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                },
              );
              if (res.ok) {
                setIsBlocked(true);
                Alert.alert(
                  t("userProfile.blocked"),
                  t("userProfile.blockedMsg", {
                    name: profile?.firstName ?? "",
                  }),
                );
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        t("userProfile.unblockUser"),
        t("userProfile.unblockDesc", {
          name: `${profile?.firstName} ${profile?.lastName}`,
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("userProfile.unblockBtn"),
            onPress: async () => {
              const res = await fetch(
                `${API_BASE_URL}/api/block/unblock/${numericUserId}`,
                {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                },
              );
              if (res.ok) setIsBlocked(false);
            },
          },
        ],
      );
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/message/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: numericUserId,
          content: message.trim(),
        }),
      });
      if (res.ok) {
        Alert.alert(
          t("userProfile.messageSent", { username: profile?.username ?? "" }),
        );
        setMessage("");
        setShowCompose(false);
      }
    } catch {
      Alert.alert(t("common.error"), t("userProfile.messageFailed"));
    } finally {
      setSending(false);
    }
  };

  const activityCount = media.length;

  const getMediaUrl = (filePath: string) => {
    if (!filePath) return null;
    if (filePath.startsWith("http")) return filePath;
    return `${API_BASE_URL}${filePath.startsWith("/") ? "" : "/"}${filePath}`;
  };

  // Otvaranje medija.
  //
  // Prije su se otvarala dva odvojena modala (slika/video) i svaki je
  // pokazivao samo tu jednu objavu — do sljedeće se dolazilo zatvaranjem i
  // povratkom u mrežicu. Sada se otvara pregled na dotaknutoj objavi, a
  // ostale se prelistavaju lijevo-desno.
  const openMedia = (item: PublicMedia) => {
    const at = media.findIndex((m) => m.id === item.id);
    if (at < 0) return;
    setPagerIndex(at);
    setPagerOpen(true);
  };

  const pagerItems: PagerItem[] = media.map((m) => ({
    id: m.id,
    url: getMediaUrl(m.filePath) || "",
    isVideo: m.mediaType === "video",
    title: m.title,
    location: m.location,
    description: m.additionalDescription,
    isEvent: m.isEvent,
    eventStartAt: m.eventStartAt,
    authorName: profile?.username ? `@${profile.username}` : undefined,
  }));

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      </SafeAreaView>
    );
  }

  const initials =
    `${profile?.firstName?.[0] ?? ""}${profile?.lastName?.[0] ?? ""}`.toUpperCase();
  const rawAvatar = profile?.avatar ?? null;
  const isPreset = rawAvatar ? !!PRESET_AVATARS[rawAvatar] : false;
  const avatarUrl =
    rawAvatar && !rawAvatar.startsWith("avatar:")
      ? getMediaUrl(rawAvatar)
      : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="arrow-back" size={28} color={V.silverBright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile?.firstName} {profile?.lastName}
        </Text>
        <TouchableOpacity
          onPress={handleBlock}
          accessibilityRole="button"
          accessibilityLabel={t("profile.blockUser")}
        >
          <Ionicons
            name="ban"
            size={22}
            color={isBlocked ? "#ff4757" : "#333"}
            accessibilityLabel={
              isBlocked ? t("profile.unblock") : t("profile.block")
            }
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Profile section */}
        <View style={styles.profileSection}>
          <StoryBadge userId={numericUserId} size={100}>
            {isPreset ? (
              <Image
                source={PRESET_AVATARS[rawAvatar!]}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : avatarUrl && !imageFailed ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </StoryBadge>

          <Text style={styles.name}>
            {profile?.firstName} {profile?.lastName}
          </Text>
          <Text style={styles.username}>@{profile?.username}</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{profile?.followersCount ?? 0}</Text>
              <Text style={styles.statLabel}>{t("userProfile.followers")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{profile?.followingCount ?? 0}</Text>
              <Text style={styles.statLabel}>{t("userProfile.following")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{activityCount}</Text>
              <Text style={styles.statLabel}>
                {t("userProfile.activities")}
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.followBtn,
                (isFollowing || isRequestPending) && styles.followingBtn,
              ]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator
                  size="small"
                  color={isFollowing || isRequestPending ? "#667eea" : "#fff"}
                />
              ) : (
                <Text
                  style={[
                    styles.followBtnText,
                    (isFollowing || isRequestPending) &&
                      styles.followingBtnText,
                  ]}
                >
                  {isFollowing
                    ? t("userProfile.following2")
                    : isRequestPending
                      ? t("userProfile.requested")
                      : t("userProfile.follow")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.msgBtn}
              onPress={() => setShowCompose(true)}
              accessibilityRole="button"
              accessibilityLabel={t("common.send")}
            >
              <Ionicons name="paper-plane-outline" size={18} color="#667eea" />
              <Text style={styles.msgBtnText}>{t("userProfile.message")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.goldenBtn, isGolden && styles.goldenBtnActive]}
              onPress={handleGoldenToggle}
              disabled={goldenLoading}
              accessibilityRole="button"
              accessibilityLabel={t("profile.goldenToggle")}
            >
              <Ionicons
                name={isGolden ? "star" : "star-outline"}
                size={20}
                color={isGolden ? "#fff" : "#FFD700"}
              />
            </TouchableOpacity>
          </View>

          {isBlocked && (
            <View style={styles.blockedBanner}>
              <Ionicons name="ban" size={16} color="#ff4757" />
              <Text style={styles.blockedText}>
                {t("userProfile.blockedBanner")}
              </Text>
            </View>
          )}
        </View>

        {/* Media grid */}
        <View style={styles.mediaSection}>
          <Text style={styles.mediaSectionTitle}>
            {t("userProfile.activities")} ({activityCount})
          </Text>
          {media.length === 0 ? (
            <View style={styles.emptyMedia}>
              <Ionicons name="images-outline" size={48} color="#ddd" />
              <Text style={styles.emptyMediaText}>
                {t("userProfile.noContent")}
              </Text>
            </View>
          ) : (
            <FlatList
              data={media}
              numColumns={3}
              keyExtractor={(item) => `${item.mediaType}_${item.id}`}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const mediaUrl = getMediaUrl(item.filePath);
                const isVideo = item.mediaType === "video";
                const isImage = item.mediaType === "image";

                return (
                  <TouchableOpacity
                    style={styles.mediaItem}
                    onPress={() => openMedia(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.openPost")}
                  >
                    {isImage && mediaUrl ? (
                      <Image
                        source={{ uri: mediaUrl }}
                        style={styles.mediaThumb}
                      />
                    ) : (
                      <View
                        style={[styles.mediaThumb, styles.mediaPlaceholder]}
                      >
                        <Ionicons name="videocam" size={30} color="#667eea" />
                      </View>
                    )}
                    {isVideo && (
                      <View style={styles.playIcon}>
                        <Ionicons name="play-circle" size={28} color="#fff" />
                      </View>
                    )}
                    {item.likeCount !== undefined && item.likeCount > 0 && (
                      <View style={styles.likeBadge}>
                        <Ionicons name="heart" size={10} color="#fff" />
                        <Text style={styles.likeCount}>{item.likeCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.mediaGrid}
            />
          )}
        </View>
      </ScrollView>

      {/* Pregled objava — prelistavanjem, bez izlaska iz pregleda. */}
      <MediaPager
        visible={pagerOpen}
        items={pagerItems}
        initialIndex={pagerIndex}
        onClose={() => setPagerOpen(false)}
      />

      {/* Compose message modal */}
      <Modal
        visible={showCompose}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowCompose(false)}
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
          <SafeAreaView
            style={{ flex: 1, backgroundColor: V.forestDeep }}
            edges={["top"]}
          >
            <View style={styles.composeHeader}>
              <Text style={styles.composeTitle}>{t("messages.title")}</Text>
              <TouchableOpacity onPress={() => setShowCompose(false)}>
                <Text
                  style={{
                    color: V.silverDim,
                    fontSize: T.body,
                    fontWeight: "600",
                  }}
                >
                  {t("common.close")}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.composeInput, { flex: 1 }]}
              placeholder={t("userProfile.writeMessage", {
                name: profile?.firstName ?? "",
              })}
              placeholderTextColor={V.silverDim}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              autoFocus
              textAlignVertical="top"
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 1.5,
                borderTopColor: V.borderGreen,
                backgroundColor: V.forestDeep,
                gap: 10,
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingHorizontal: 18,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor:
                    message.trim() && !sending ? V.visited : V.borderDim,
                  borderWidth: 1.5,
                  borderColor:
                    message.trim() && !sending ? V.borderGreen : V.borderDim,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                onPress={handleSendMessage}
                disabled={!message.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={V.silverBright} />
                ) : (
                  <Text
                    style={{
                      color: V.silverBright,
                      fontSize: T.body,
                      fontWeight: "700",
                    }}
                  >
                    {t("userProfile.send")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// const styles = StyleSheet.create({
//   safeArea: { flex: 1, backgroundColor: "#fff" },
//   center: { flex: 1, justifyContent: "center", alignItems: "center" },
//   header: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     padding: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: "#f0f0f0",
//   },
//   headerTitle: {
//     flex: 1,
//     fontSize: T.lead,
//     fontWeight: "600",
//     color: "#333",
//     marginHorizontal: 12,
//     textAlign: "center",
//   },
//   profileSection: {
//     alignItems: "center",
//     padding: 24,
//     borderBottomWidth: 1,
//     borderBottomColor: "#f0f0f0",
//   },
//   avatar: { width: 100, height: 100, borderRadius: 50 },
//   avatarPlaceholder: {
//     width: 100,
//     height: 100,
//     borderRadius: 50,
//     backgroundColor: "#667eea",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   avatarInitials: { color: "#fff", fontSize: 38, fontWeight: "700" },
//   name: {
//     fontSize: T.screen,
//     fontWeight: "700",
//     color: "#1a1a1a",
//     marginTop: 12,
//     marginBottom: 4,
//   },
//   username: { fontSize: T.body, color: "#667eea", marginBottom: 16 },
//   statsRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 24,
//     marginBottom: 20,
//   },
//   stat: { alignItems: "center" },
//   statNum: { fontSize: T.title, fontWeight: "700", color: "#1a1a1a" },
//   statLabel: { fontSize: T.meta, color: "#999", marginTop: 2 },
//   statDivider: { width: 1, height: 32, backgroundColor: "#e0e0e0" },
//   actionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
//   followBtn: {
//     backgroundColor: "#667eea",
//     borderRadius: 22,
//     paddingHorizontal: 28,
//     paddingVertical: 10,
//     minWidth: 100,
//     alignItems: "center",
//   },
//   followingBtn: {
//     backgroundColor: "#fff",
//     borderWidth: 1.5,
//     borderColor: "#667eea",
//   },
//   followBtnText: { color: "#fff", fontSize: T.body, fontWeight: "700" },
//   followingBtnText: { color: "#667eea" },
//   msgBtn: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//     backgroundColor: "#f0f0ff",
//     borderRadius: 22,
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//   },
//   msgBtnText: { color: "#667eea", fontSize: T.body, fontWeight: "600" },
//   goldenBtn: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     backgroundColor: "#fff",
//     borderWidth: 2,
//     borderColor: "#FFD700",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   goldenBtnActive: { backgroundColor: "#FFD700", borderColor: "#FFD700" },
//   blockedBanner: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 8,
//     backgroundColor: "#fff0f0",
//     borderRadius: 10,
//     padding: 10,
//     marginTop: 12,
//   },
//   blockedText: { fontSize: T.meta, color: "#ff4757", flex: 1 },
//   mediaSection: { padding: 16 },
//   mediaSectionTitle: {
//     fontSize: T.lead,
//     fontWeight: "700",
//     color: "#1a1a1a",
//     marginBottom: 12,
//   },
//   mediaGrid: { gap: 2 },
//   mediaItem: {
//     width: (SCREEN_W - 32) / 3,
//     aspectRatio: 1,
//     padding: 1,
//     position: "relative",
//   },
//   mediaThumb: { width: "100%", height: "100%", backgroundColor: "#f0f0f0" },
//   mediaPlaceholder: {
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#f0f0ff",
//   },
//   playIcon: {
//     position: "absolute",
//     top: 0,
//     left: 0,
//     right: 0,
//     bottom: 0,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "rgba(0,0,0,0.2)",
//   },
//   likeBadge: {
//     position: "absolute",
//     bottom: 4,
//     right: 4,
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 2,
//     backgroundColor: "rgba(0,0,0,0.6)",
//     borderRadius: 10,
//     paddingHorizontal: 5,
//     paddingVertical: 2,
//   },
//   likeCount: { color: "#fff", fontSize: 10, fontWeight: "600" },
//   emptyMedia: { alignItems: "center", paddingTop: 40, gap: 12 },
//   emptyMediaText: { fontSize: T.body, color: "#bbb" },
//   composeHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     padding: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: "#eee",
//   },
//   composeTitle: {
//     fontSize: T.body,
//     fontWeight: "600",
//     color: "#333",
//     flex: 1,
//     marginHorizontal: 10,
//   },
//   composeSendBtn: {
//     backgroundColor: "#667eea",
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     borderRadius: 20,
//   },
//   composeSendBtnDisabled: { backgroundColor: "#ccc" },
//   composeSendBtnText: { color: "#fff", fontWeight: "700" },
//   composeInput: {
//     flex: 1,
//     fontSize: T.lead,
//     color: "#333",
//     padding: 16,
//     lineHeight: 24,
//   },
//   imageModalHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     padding: 16,
//     backgroundColor: "#000",
//     borderBottomWidth: 1,
//     borderBottomColor: "#222",
//   },
//   imageModalTitle: {
//     fontSize: T.lead,
//     fontWeight: "600",
//     color: "#fff",
//     flex: 1,
//     marginHorizontal: 12,
//     textAlign: "center",
//   },
//   imageModalContent: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#000",
//   },
//   imageModalImage: {
//     width: "100%",
//     height: "100%",
//   },
// });

// Izbaci statički const styles = StyleSheet.create({...}) s dna datoteke
// i dodaj ovu funkciju:
function makeStyles(V: ReturnType<typeof getVara>) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: V.forestDeep },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: V.forestDeep,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: V.borderGreen,
      backgroundColor: V.forestDeep,
    },
    headerTitle: {
      flex: 1,
      fontSize: T.lead,
      fontWeight: "600",
      color: V.silverBright,
      marginHorizontal: 12,
      textAlign: "center",
    },
    profileSection: {
      alignItems: "center",
      padding: 24,
      borderBottomWidth: 1,
      borderBottomColor: V.borderDim,
      backgroundColor: V.forestDeep,
    },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: V.forestLight,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarInitials: { color: V.silverBright, fontSize: 38, fontWeight: "700" },
    name: {
      fontSize: T.screen,
      fontWeight: "700",
      color: V.silverBright,
      marginTop: 12,
      marginBottom: 4,
    },
    username: { fontSize: T.body, color: V.visited, marginBottom: 16 },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 24,
      marginBottom: 20,
    },
    stat: { alignItems: "center" },
    statNum: { fontSize: T.title, fontWeight: "700", color: V.silverBright },
    statLabel: { fontSize: T.meta, color: V.silverDim, marginTop: 2 },
    statDivider: { width: 1, height: 32, backgroundColor: V.borderDim },
    actionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    followBtn: {
      backgroundColor: V.visited,
      borderRadius: 22,
      paddingHorizontal: 28,
      paddingVertical: 10,
      minWidth: 100,
      alignItems: "center",
    },
    followingBtn: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: V.visited,
    },
    followBtnText: {
      color: V.silverBright,
      fontSize: T.body,
      fontWeight: "700",
    },
    followingBtnText: { color: V.visited },
    msgBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: V.forestMid,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: V.borderGreen,
    },
    msgBtnText: { color: V.visited, fontSize: T.body, fontWeight: "600" },
    goldenBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: V.forestMid,
      borderWidth: 2,
      borderColor: V.accentGold,
      justifyContent: "center",
      alignItems: "center",
    },
    goldenBtnActive: {
      backgroundColor: V.accentGold,
      borderColor: V.accentGold,
    },
    blockedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: V.forestMid,
      borderRadius: 10,
      padding: 10,
      marginTop: 12,
      borderWidth: 1,
      borderColor: V.danger,
    },
    blockedText: { fontSize: T.meta, color: V.danger, flex: 1 },
    mediaSection: { padding: 16, backgroundColor: V.forestDeep },
    mediaSectionTitle: {
      fontSize: T.lead,
      fontWeight: "700",
      color: V.silverBright,
      marginBottom: 12,
    },
    mediaGrid: { gap: 2 },
    mediaItem: {
      width: (SCREEN_W - 32) / 3,
      aspectRatio: 1,
      padding: 1,
      position: "relative",
    },
    mediaThumb: { width: "100%", height: "100%", backgroundColor: V.forestMid },
    mediaPlaceholder: {
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: V.forestMid,
    },
    playIcon: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.2)",
    },
    likeBadge: {
      position: "absolute",
      bottom: 4,
      right: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      backgroundColor: "rgba(0,0,0,0.6)",
      borderRadius: 10,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    likeCount: { color: "#fff", fontSize: 10, fontWeight: "600" },
    emptyMedia: { alignItems: "center", paddingTop: 40, gap: 12 },
    emptyMediaText: { fontSize: T.body, color: V.silverDim },
    // Compose modal
    composeHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: V.borderDim,
      backgroundColor: V.forestDeep,
    },
    composeTitle: {
      fontSize: T.body,
      fontWeight: "600",
      color: V.silverBright,
      flex: 1,
      marginHorizontal: 10,
    },
    composeSendBtn: {
      backgroundColor: V.visited,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    composeSendBtnDisabled: { backgroundColor: V.borderDim },
    composeSendBtnText: { color: V.silverBright, fontWeight: "700" },
    composeInput: {
      flex: 1,
      fontSize: T.lead,
      color: V.silverBright,
      padding: 16,
      lineHeight: 24,
      backgroundColor: V.forestDeep,
    },
    // Image/Video modal
    imageModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      backgroundColor: "#000",
    },
    imageModalTitle: {
      fontSize: T.lead,
      fontWeight: "600",
      color: "#fff",
      flex: 1,
      marginHorizontal: 12,
      textAlign: "center",
    },
    imageModalContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
    },
    imageModalImage: { width: "100%", height: "100%" },
  });
}
