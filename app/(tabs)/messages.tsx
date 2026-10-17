// app/(tabs)/messages.tsx
// KLJUČNE IZMJENE:
// 1. StoriesRow – uklonjen dupli border (hasStory/viewedStory) s TouchableOpacity;
//    jedini vizualni indikator je sada StoryIndicator prsten
// 2. Komentar input – ispravan KeyboardAvoidingView za iOS i Android
// 3. Vlasnik storyja vidi popis pregleda s brojem i imenima
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppState,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AppStateStatus } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../app/config/api";
import { StoryBadge } from "../../app/StoryBadge";
import { useTheme } from "../../components/AdaptiveThemeProvider";
import { Conversation, getConversations } from "../../utils/messagesApi";
import { useInputBottomOffset } from "@/hooks/use-keyboard-offset";
import { T } from "../../styles/varaTheme";
import { getToken } from "@/utils/tokenStore";

const PRESET_AVATARS_MSG: Record<string, any> = {
  "avatar:male": require("../../assets/images/avatar-male.png"),
  "avatar:female": require("../../assets/images/avatar-female.png"),
};

function getM(dark: boolean) {
  return {
    bg: dark ? "#1a2e1a" : "#f0ede4",
    bgCard: dark ? "#2a4230" : "#e4ead8",
    bgCardHover: dark ? "#3a5a30" : "#ccdcb8",
    border: dark ? "#3a5a30" : "#c0d0a8",
    borderBright: dark ? "#4a7040" : "#5a8a40",
    textPrimary: dark ? "#e8e8e8" : "#1a2a18",
    textSecondary: dark ? "#c0c0c0" : "#3a4a35",
    textMuted: dark ? "#a0a0a0" : "#5a6a55",
    accent: dark ? "#5a8a48" : "#3a6a28",
    accentBright: dark ? "#6a9a60" : "#2a5a20",
    inputBg: dark ? "#2a4230" : "#e4ead8",
    inputBorder: dark ? "#4a7040" : "#5a8a40",
    placeholder: dark ? "#6a9a60" : "#7a8a75",
    unreadBg: dark ? "#3a5a30" : "#ccdcb8",
    errorBg: dark ? "#3a1a1a" : "#fde8e8",
    errorBorder: dark ? "#5a2a2a" : "#f0b0b0",
  } as const;
}

function normalizeAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar || avatar.trim() === "") return null;
  // Odbaci sve placeholder stringove (avatar:male, avatar:female, default, itd.)
  if (avatar.startsWith("avatar:") || avatar === "default" || avatar === "null")
    return null;
  const base =
    avatar.startsWith("http://") || avatar.startsWith("https://")
      ? avatar
      : `${API_BASE_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
  if (!base.includes("_t=")) {
    return `${base}${base.includes("?") ? "&" : "?"}_t=${Date.now()}`;
  }
  return base;
}

interface Story {
  id: number;
  userId: number;
  userName: string;
  userAvatar?: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  createdAt: string;
  viewedByMe: boolean;
  viewCount: number;
  likeCount?: number;
  likedByMe?: boolean;
  viewers?: { userId: number; userName: string; userAvatar?: string }[];
  likes?: {
    userId: number;
    userName: string;
    userAvatar?: string;
    reactionType?: string;
  }[];
  comments?: {
    id: number;
    userId: number;
    userName: string;
    userAvatar?: string;
    text: string;
    createdAt: string;
    reactions?: { userId: number; reactionType: string }[];
  }[];
}

// ─── Helper funkcija za countdown ─────────────────────────────────────────────
function useStoryCountdown(createdAt: string) {
  const [remaining, setRemaining] = useState<string>("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const expiresAt = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;

    const update = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setRemaining("Isteklo");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) {
        setRemaining(`${h}h ${m}m`);
      } else {
        setRemaining(`${m}m ${s.toString().padStart(2, "0")}s`);
      }
    };

    // Sekunde se prikazuju samo u zadnjem satu; iznad toga natpis glasi
    // "Xh Ym" i mijenja se jednom u minuti. Prije se osvježavalo svake
    // sekunde kroz cijela 24 sata — a svaki mountani odbrojavač znači jedan
    // ponovni render po sekundi, pa je popis s dvadesetak priča izazivao
    // dvadesetak rendera u sekundi bez ijedne vidljive promjene.
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      update();
      const diff = expiresAt - Date.now();
      if (diff <= 0) return;
      timer = setTimeout(tick, diff < 3600000 ? 1000 : 30000);
    };

    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [createdAt]);

  return { remaining, expired };
}

// ─── Story Timer komponenta ───────────────────────────────────────────────────
function StoryTimer({ createdAt }: { createdAt: string }) {
  const { t } = useTranslation();
  const { remaining, expired } = useStoryCountdown(createdAt);

  return (
    <View
      style={[
        storyTimerStyle.container,
        expired && storyTimerStyle.expiredContainer,
      ]}
    >
      <Ionicons
        name="time-outline"
        size={13}
        color={expired ? "#ff4757" : "rgba(255,255,255,0.9)"}
      />
      <Text
        style={[storyTimerStyle.text, expired && storyTimerStyle.expiredText]}
      >
        {expired ? t("story.expired") : `${t("story.expiresIn")} ${remaining}`}
      </Text>
    </View>
  );
}

const storyTimerStyle = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  expiredContainer: {
    backgroundColor: "rgba(255,71,87,0.3)",
  },
  text: {
    fontSize: T.meta,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
  expiredText: {
    color: "#ff4757",
  },
});

// ─── Story Viewer ─────────────────────────────────────────────────────────────
function StoryViewer({
  story,
  onClose,
  onDelete,
  isOwner,
  onSendMessage,
  currentUserId,
}: {
  story: Story;
  onClose: () => void;
  onDelete: (id: number) => void;
  isOwner: boolean;
  onSendMessage?: (userId: number, name: string) => void;
  currentUserId?: number | null;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  console.log("StoryViewer opened with story:", story?.id, story?.userName); // Debug
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [showViewers, setShowViewers] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // Odmak retka za unos komentara iznad tipkovnice (vidi hook).
  const commentsInputOffset = useInputBottomOffset();
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(story.likedByMe || false);
  const [likeCount, setLikeCount] = useState(story.likeCount || 0);
  const [comments, setComments] = useState(story.comments || []);
  const [paused, setPaused] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [localStory, setLocalStory] = useState(story);
  const [viewers, setViewers] = useState(story.viewers || []);
  const [loadingViewers, setLoadingViewers] = useState(false);

  const DURATION = story.mediaType === "image" ? 5000 : 15000;
  const player = useVideoPlayer(
    story.mediaType === "video" ? story.mediaUrl : "",
    (p) => {
      p.loop = false;
      p.muted = false;
    },
  );

  const reactions = ["👍", "❤️", "😊", "😂", "😮", "😢", "🔥"];

  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(
    story.userAvatar ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    const fetchAvatar = async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE_URL}/api/auth/users/${story.userId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();

        // Pokušaj sva moguća polja (Dapper vraća PascalCase)
        const avatarField =
          data.Avatar ||
          data.avatar ||
          data.avatarUrl ||
          data.AvatarUrl ||
          data.profileImage ||
          data.ProfileImage ||
          data.photo ||
          null;

        if (cancelled) return;

        if (avatarField && PRESET_AVATARS_MSG[avatarField]) {
          // preset avatar – pohrani string za Image source={PRESET_AVATARS_MSG[...]}
          setResolvedAvatarUrl(avatarField);
        } else {
          const freshUrl = normalizeAvatarUrl(avatarField);
          if (freshUrl) setResolvedAvatarUrl(freshUrl);
        }
      } catch (e) {
        console.error("StoryViewer avatar fetch error:", e);
      }
    };
    fetchAvatar();
    return () => {
      cancelled = true;
    };
  }, [story.userId]);

  const startProgress = () => {
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: false,
    });
    animationRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const pauseProgress = () => {
    if (animationRef.current) {
      animationRef.current.stop();
      setPaused(true);
      if (story.mediaType === "video") player.pause();
    }
  };

  const resumeProgress = () => {
    progress.stopAnimation((value) => {
      const remainingDuration = DURATION * (1 - value);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: remainingDuration,
        useNativeDriver: false,
      });
      animationRef.current = anim;
      anim.start(({ finished }) => {
        if (finished) onClose();
      });
      setPaused(false);
      if (story.mediaType === "video") player.play();
    });
  };

  const handleTap = () => {
    if (paused) resumeProgress();
    else pauseProgress();
  };

  // U StoryViewer, zamijeni markAsViewed funkciju

  useEffect(() => {
    const markAsViewed = async () => {
      const token = await getToken();
      console.log("markAsViewed called, token exists:", !!token);
      if (!token) return;
      try {
        console.log("Calling API: /api/story/mark-viewed/${story.id}");
        const response = await fetch(
          `${API_BASE_URL}/api/story/mark-viewed/${story.id}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        console.log("Mark as viewed response status:", response.status);

        const data = await response.json();
        console.log("Mark as viewed response data:", data);

        // Dohvati svježe viewers za ovaj story
        const viewersRes = await fetch(
          `${API_BASE_URL}/api/story/viewers/${story.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (viewersRes.ok) {
          const freshViewers = await viewersRes.json();
          console.log("Fresh viewers:", freshViewers); // Debug
          setViewers(freshViewers);
          setLocalStory((prev) => ({
            ...prev,
            viewers: freshViewers,
            viewCount: freshViewers.length,
          }));
        }

        // Osvježi ostale podatke
        const storyRes = await fetch(`${API_BASE_URL}/api/story`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (storyRes.ok) {
          const stories = await storyRes.json();
          const updatedStory = stories.find((s: Story) => s.id === story.id);
          if (updatedStory) {
            setLocalStory(updatedStory);
            setLikeCount(updatedStory.likeCount || 0);
            setLiked(updatedStory.likedByMe || false);
            setComments(updatedStory.comments || []);
          }
        }
      } catch (error) {
        console.error("Mark as viewed error:", error);
      }
    };

    markAsViewed();
    startProgress();
    if (story.mediaType === "video") player.play();

    return () => {
      if (animationRef.current) animationRef.current.stop();
      if (story.mediaType === "video") player.pause();
    };
  }, [story.id]);

  // Osvježi viewerse kad vlasnik otvori modal
  const handleOpenViewers = async () => {
    pauseProgress();
    setLoadingViewers(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/story/mark-viewed/${story.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setViewers(data);
      }
    } catch (error) {
      console.error("Error fetching viewers:", error);
    } finally {
      setLoadingViewers(false);
      setShowViewers(true);
    }
  };

  const handleLike = async (reactionType: string = "like") => {
    const token = await getToken();
    if (!token) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));
    try {
      if (wasLiked) {
        await fetch(`${API_BASE_URL}/api/story/like/${story.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`${API_BASE_URL}/api/story/like/${story.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reactionType }),
        });
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
      Alert.alert(t("common.error"), t("story.cannotLike"));
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/story/comment/${story.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: commentText }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev: any[]) => [newComment, ...prev]);
        setCommentText("");
      }
    } catch {
      Alert.alert(t("common.error"), t("story.cannotComment"));
    }
  };

  const handleReactToComment = async (
    commentId: number,
    reactionType: string,
  ) => {
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/api/story/comment/react/${commentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reactionType }),
      });
      setComments((prev: any[]) =>
        prev.map((c: any) => {
          if (c.id !== commentId) return c;
          const existing = c.reactions?.find(
            (r: any) => r.userId === currentUserId,
          );
          if (existing) {
            return {
              ...c,
              reactions: c.reactions?.map((r: any) =>
                r.userId === currentUserId ? { ...r, reactionType } : r,
              ),
            };
          }
          return {
            ...c,
            reactions: [
              ...(c.reactions || []),
              {
                id: Date.now(),
                commentId,
                userId: currentUserId!,
                reactionType,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }),
      );
    } catch {}
  };

  const handleOpenComments = () => {
    pauseProgress();
    setShowComments(true);
  };

  const handleCloseComments = () => {
    setShowComments(false);
    resumeProgress();
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={sv.container}>
      <View style={sv.bg} />
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleTap}
        style={StyleSheet.absoluteFillObject}
      >
        {story.mediaType === "image" ? (
          <Image
            source={{ uri: story.mediaUrl }}
            style={sv.media}
            resizeMode="contain"
          />
        ) : (
          <VideoView
            player={player}
            style={sv.media}
            contentFit="contain"
            nativeControls={false}
          />
        )}
      </TouchableOpacity>

      {/* Traka napretka */}
      <View style={sv.progressBar}>
        <Animated.View style={[sv.progressFill, { width: progressWidth }]} />
      </View>

      {/* Header */}
      <View style={sv.header}>
        <View style={sv.userInfo}>
          <TouchableOpacity
            onPress={() => onSendMessage?.(story.userId, story.userName)}
            accessibilityRole="button"
            accessibilityLabel={t("videos.sendToUser")}
          >
            <View style={sv.smallAvatar}>
              {resolvedAvatarUrl && PRESET_AVATARS_MSG[resolvedAvatarUrl] ? (
                <Image
                  source={PRESET_AVATARS_MSG[resolvedAvatarUrl]}
                  style={sv.smallAvatarImg}
                  resizeMode="cover"
                />
              ) : resolvedAvatarUrl &&
                !resolvedAvatarUrl.startsWith("avatar:") ? (
                <Image
                  source={{ uri: resolvedAvatarUrl }}
                  style={sv.smallAvatarImg}
                  resizeMode="cover"
                  onError={() => setResolvedAvatarUrl(null)}
                />
              ) : (
                <Text style={sv.smallAvatarText}>
                  {story.userName?.[0]?.toUpperCase() ?? "?"}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          <View>
            <TouchableOpacity
              onPress={() => onSendMessage?.(story.userId, story.userName)}
            >
              <Text style={sv.storyUser}>{story.userName}</Text>
            </TouchableOpacity>
            <Text style={sv.storyTime}>
              {new Date(story.createdAt).toLocaleTimeString("hr-HR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={sv.closeBtn}>
          <Text
            style={{ color: "#c0c0c0", fontSize: T.body, fontWeight: "600" }}
          >
            Zatvori
          </Text>
        </TouchableOpacity>
      </View>

      {/* Interakcije */}
      <View style={sv.interactions}>
        <TouchableOpacity
          onLongPress={() => setShowReactionPicker(true)}
          onPress={() => handleLike()}
          style={sv.interactionBtn}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={28}
            color={liked ? "#ff4757" : "#fff"}
          />
          <Text style={sv.interactionCount}>{likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleOpenComments}
          style={sv.interactionBtn}
        >
          <Ionicons name="chatbubble-outline" size={26} color="#fff" />
          <Text style={sv.interactionCount}>{comments.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSendMessage?.(story.userId, story.userName)}
          style={sv.interactionBtn}
          accessibilityRole="button"
          accessibilityLabel={t("common.send")}
        >
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Reaction Picker */}
      <Modal
        visible={showReactionPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReactionPicker(false)}
      >
        <TouchableOpacity
          style={sv.reactionPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowReactionPicker(false)}
        >
          <View style={sv.reactionPickerContainer}>
            {reactions.map((reaction, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  handleLike(reaction);
                  setShowReactionPicker(false);
                }}
                style={sv.reactionOption}
              >
                <Text style={sv.reactionEmoji}>{reaction}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Footer – SAMO za vlasnika */}
      <View style={sv.footer}>
        {isOwner && (
          <>
            <TouchableOpacity style={sv.viewersBtn} onPress={handleOpenViewers}>
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={sv.viewersBtnText}>
                Pregledano{" "}
                {viewers.length > 0 ? viewers.length : localStory.viewCount}
              </Text>
            </TouchableOpacity>

            <StoryTimer createdAt={story.createdAt} />
            <TouchableOpacity
              style={sv.likesBtn}
              onPress={() => {
                pauseProgress();
                setShowLikes(true);
              }}
            >
              <Ionicons name="heart-outline" size={18} color="#fff" />
              <Text style={sv.viewersBtnText}>{likeCount} lajk</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sv.deleteBtn}
              onPress={() => {
                onDelete(story.id);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
            >
              <Ionicons name="trash-outline" size={20} color="#ff4757" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Viewers Modal ── */}
      {/* ── Viewers Modal ── */}
      <Modal
        visible={showViewers}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowViewers(false);
          resumeProgress();
        }}
      >
        <View style={sv.viewersModal}>
          <View style={sv.viewersContent}>
            <View style={sv.viewersHeader}>
              <Text style={sv.viewersTitle}>
                {t("story.viewedBy")} ({viewers.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowViewers(false);
                  resumeProgress();
                }}
              >
                <Text
                  style={{
                    color: "#c0c0c0",
                    fontSize: T.body,
                    fontWeight: "600",
                  }}
                >
                  Zatvori
                </Text>
              </TouchableOpacity>
            </View>

            {/* DODAJ OVAJ DIO ZA LOADING */}
            {loadingViewers ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#2D6418" />
                <Text style={{ marginTop: 12, color: "#999" }}>
                  Učitavanje...
                </Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(item, i) => i.toString()}
                renderItem={({ item }) => (
                  <View style={sv.viewerRow}>
                    {item.userAvatar ? (
                      <Image
                        source={{ uri: item.userAvatar }}
                        style={sv.viewerAvatar}
                      />
                    ) : (
                      <View style={sv.viewerAvatarPlaceholder}>
                        <Text style={sv.viewerAvatarText}>
                          {item.userName?.[0]?.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={sv.viewerName}>{item.userName}</Text>
                    <Ionicons
                      name="eye"
                      size={16}
                      color="#ccc"
                      style={{ marginLeft: "auto" }}
                    />
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={sv.noViewers}>{t("story.noViewsYet")}</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Likes Modal ── */}
      <Modal
        visible={showLikes}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowLikes(false);
          resumeProgress();
        }}
      >
        <View style={sv.viewersModal}>
          <View style={sv.viewersContent}>
            <View style={sv.viewersHeader}>
              <Text style={sv.viewersTitle}>
                {t("story.likes")} ({likeCount})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLikes(false);
                  resumeProgress();
                }}
              >
                <Text
                  style={{
                    color: "#c0c0c0",
                    fontSize: T.body,
                    fontWeight: "600",
                  }}
                >
                  Zatvori
                </Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={localStory.likes || []}
              keyExtractor={(item, i) => i.toString()}
              renderItem={({ item }) => (
                <View style={sv.viewerRow}>
                  {item.userAvatar ? (
                    <Image
                      source={{ uri: item.userAvatar }}
                      style={sv.viewerAvatar}
                    />
                  ) : (
                    <Ionicons name="person-circle" size={40} color="#5a8a48" />
                  )}
                  <Text style={sv.viewerName}>{item.userName}</Text>
                  <Text style={sv.reactionType}>{item.reactionType}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={sv.noViewers}>{t("story.noLikesYet")}</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* ── Comments Modal – ISPRAVLJEN keyboard ── */}
      <Modal
        visible={showComments}
        transparent
        animationType="slide"
        onRequestClose={handleCloseComments}
      >
        {/*
          FIX: KeyboardAvoidingView mora omotati CIJELI modal sadržaj.
          Za iOS koristimo "padding", za Android "height".
          Modal je transparent pa flex: 1 + justifyContent: "flex-end" radi ispravno.
        */}
        <KeyboardAvoidingView
          style={sv.commentsKAV}
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
          <TouchableOpacity
            style={sv.commentsOverlay}
            activeOpacity={1}
            onPress={handleCloseComments}
          />
          <View style={sv.commentsContent}>
            <View
              style={[
                sv.commentsHeader,
                {
                  backgroundColor: colors.background,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Text style={sv.commentsTitle}>
                {t("story.comments")} ({comments.length})
              </Text>
              <TouchableOpacity onPress={handleCloseComments}>
                <Text
                  style={{
                    color: "#c0c0c0",
                    fontSize: T.body,
                    fontWeight: "600",
                  }}
                >
                  Zatvori
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={comments}
              keyExtractor={(item) => item.id.toString()}
              style={sv.commentsList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={sv.commentItem}>
                  <View style={sv.commentHeader}>
                    {item.userAvatar ? (
                      <Image
                        source={{ uri: item.userAvatar }}
                        style={sv.commentAvatar}
                      />
                    ) : (
                      <Ionicons
                        name="person-circle"
                        size={32}
                        color="#2D6418"
                      />
                    )}
                    <Text style={sv.commentUserName}>{item.userName}</Text>
                    <Text style={sv.commentTime}>
                      {new Date(item.createdAt).toLocaleTimeString("hr-HR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <Text style={sv.commentText}>{item.text}</Text>
                  {item.reactions && item.reactions.length > 0 && (
                    <View style={sv.commentReactionsList}>
                      {item.reactions.map((reaction, idx) => (
                        <View key={idx} style={sv.commentReactionBadge}>
                          <Text style={sv.commentReactionBadgeText}>
                            {reaction.reactionType}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {isOwner && (
                    <View style={sv.commentReactionButtons}>
                      {reactions.map((reaction, idx) => {
                        const hasReaction = item.reactions?.some(
                          (r) =>
                            r.userId === currentUserId &&
                            r.reactionType === reaction,
                        );
                        return (
                          <TouchableOpacity
                            key={idx}
                            onPress={() =>
                              handleReactToComment(item.id, reaction)
                            }
                            style={[
                              sv.commentReactionBtn,
                              hasReaction && sv.commentReactionBtnActive,
                            ]}
                          >
                            <Text style={sv.commentReactionEmoji}>
                              {reaction}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            />

            {/* Input – uvijek vidljiv iznad tipkovnice.
                Na Androidu ovo je unutar <Modal>-a, gdje KeyboardAvoidingView
                ne radi (modal je zaseban prozor bez adjustResize), pa se odmak
                računa iz izmjerene visine tipkovnice. */}
            <View
              style={[
                sv.commentInputContainer,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                  marginBottom:
                    Platform.OS === "android" ? commentsInputOffset : 0,
                },
              ]}
            >
              <View
                style={[
                  sv.commentInputWrapper,
                  { backgroundColor: isDark ? "#1C2128" : "#f5f5f5" },
                ]}
              >
                <TextInput
                  style={sv.commentInput}
                  placeholder={t("story.writeComment")}
                  placeholderTextColor="#6a9a60"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={300}
                  returnKeyType="send"
                  onSubmitEditing={handleAddComment}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={handleAddComment}
                  style={sv.commentSendBtn}
                  disabled={!commentText.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.send")}
                >
                  <Ionicons
                    name="send"
                    size={22}
                    color={commentText.trim() ? "#2D6418" : "#ccc"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const sv = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  // Puni zaslon bez fiksnih mjera: SCREEN_W/SCREEN_H su se očitavali jednom pri
  // učitavanju modula i nikad se nisu osvježili, pa je u podijeljenom zaslonu i
  // na preklopnim uređajima priča bila veća od prozora.
  media: { ...StyleSheet.absoluteFillObject },
  progressBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 32,
    left: 16,
    right: 16,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 2,
  },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  header: {
    position: "absolute",
    top: Platform.OS === "ios" ? 64 : 44,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3a5a30",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#5a8a48",
    overflow: "hidden",
  },
  smallAvatarImg: { width: 40, height: 40 },
  smallAvatarText: { color: "#e8e8e8", fontWeight: "700", fontSize: T.lead },
  storyUser: { color: "#fff", fontWeight: "700", fontSize: T.body },
  storyTime: { color: "rgba(255,255,255,0.7)", fontSize: T.meta },
  closeBtn: { padding: 8 },
  interactions: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 100 : 80,
    right: 16,
    gap: 20,
    alignItems: "center",
  },
  interactionBtn: { alignItems: "center", gap: 4 },
  interactionCount: { color: "#fff", fontSize: T.meta, fontWeight: "600" },
  reactionPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  reactionPickerContainer: {
    flexDirection: "row",
    backgroundColor: "#2a4230",
    borderRadius: 40,
    padding: 12,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#5a8a48",
  },
  reactionOption: { padding: 8 },
  reactionEmoji: { fontSize: T.hero },
  footer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 24,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  viewersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  likesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  viewersBtnText: { color: "#fff", fontSize: T.body },
  deleteBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 10,
    borderRadius: 22,
  },

  // ── Viewers / Likes Modal ──
  viewersModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  viewersContent: {
    backgroundColor: "#1a2e1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1.5,
    borderColor: "#4a7040",
    padding: 20,
    minHeight: 200,
    maxHeight: "70%",
  },
  viewersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#3a5a30",
  },
  viewersTitle: { fontSize: T.title, fontWeight: "700", color: "#e8e8e8" },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    paddingVertical: 4,
  },
  viewerAvatar: { width: 40, height: 40, borderRadius: 20 },
  viewerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3a5a30",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#5a8a48",
  },
  viewerAvatarText: { color: "#e8e8e8", fontWeight: "700" },
  viewerName: { fontSize: T.body, color: "#e8e8e8" },
  reactionType: { marginLeft: "auto", fontSize: T.title },
  noViewers: { color: "#6a9a60", textAlign: "center", marginTop: 20 },

  // ── Comments Modal ──
  commentsKAV: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  commentsOverlay: { height: 0 },
  commentsContent: {
    backgroundColor: "#1a2e1a",
    borderTopLeftRadius: 0, // ← ukloni zaobljenje za puni ekran
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    borderColor: "#4a7040",
    flex: 1,
  },
  commentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 54 : 36, // ← sigurna zona za status bar
    borderBottomWidth: 1,
    borderBottomColor: "#3a5a30",
    backgroundColor: "#1a2e1a",
  },
  commentsTitle: { fontSize: T.title, fontWeight: "700", color: "#e8e8e8" },
  commentsList: { flex: 1, paddingHorizontal: 16 },
  commentItem: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#2a4230",
    backgroundColor: "#1a2e1a",
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentUserName: { fontWeight: "700", color: "#e8e8e8", fontSize: T.body },
  commentTime: { fontSize: T.caption, color: "#6a9a60", marginLeft: "auto" },
  commentText: {
    fontSize: T.body,
    color: "#c0c0c0",
    lineHeight: 20,
    marginLeft: 42,
  },
  commentReactionsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginLeft: 42,
  },
  commentReactionBadge: {
    backgroundColor: "#2a4230",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3a5a30",
  },
  commentReactionBadgeText: { fontSize: T.body },
  commentReactionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginLeft: 42,
  },
  commentReactionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#2a4230",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3a5a30",
  },
  commentReactionBtnActive: {
    backgroundColor: "#3a5a30",
    borderColor: "#5a8a48",
  },
  commentReactionEmoji: { fontSize: T.lead },
  commentInputContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#3a5a30",
    backgroundColor: "#1a2e1a",
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
  },
  commentInputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#2a4230",
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#4a7040",
  },
  commentInput: {
    flex: 1,
    fontSize: T.body,
    color: "#e8e8e8",
    maxHeight: 120,
    paddingVertical: 8,
    minHeight: 44,
  },
  commentSendBtn: { padding: 10, marginLeft: 8 },
});

// ─── Stories Row ─────────────────────────────────────────────────────────────
function StoriesRow({
  currentUserId,
  onAddStory,
}: {
  currentUserId: number | null;
  onAddStory: () => void;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const M = useMemo(() => getM(isDark), [isDark]);
  const srs = useMemo(() => getSrsStyles(colors, M), [M]);
  const [stories, setStories] = useState<Story[]>([]);
  const [viewing, setViewing] = useState<Story | null>(null);

  const loadStories = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/story`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Stories data sample:", JSON.stringify(data[0])); // ← DODAJ
        setStories(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadStories();
  }, [currentUserId]);

  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

  // Dohvati vlastiti avatar
  useEffect(() => {
    if (!currentUserId) return;
    const fetchMyAvatar = async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE_URL}/api/auth/users/${currentUserId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          console.log("My user data:", JSON.stringify(data)); // ← DODAJ
          const avatarField =
            data.Avatar ||
            data.avatarUrl ||
            data.profileImage ||
            data.photo ||
            data.avatar ||
            null;
          setMyAvatarUrl(avatarField ?? null);
        }
      } catch {}
    };
    fetchMyAvatar();
  }, [currentUserId]);

  const handleDelete = async (id: number) => {
    try {
      const token = await getToken();
      await fetch(`${API_BASE_URL}/api/story/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setStories((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  };

  const myStories = stories.filter((s) => s.userId === currentUserId);
  const otherStories = stories.filter((s) => s.userId !== currentUserId);

  const byUser: Record<number, Story[]> = {};
  otherStories.forEach((s) => {
    if (!byUser[s.userId]) byUser[s.userId] = [];
    byUser[s.userId].push(s);
  });

  interface StoryGroup {
    userId: number;
    userName: string;
    stories: Story[];
    unread: boolean;
    avatar?: string;
  }

  const groups: StoryGroup[] = Object.entries(byUser).map(([uid, ss]) => ({
    userId: parseInt(uid),
    userName: ss[0].userName,
    stories: ss,
    avatar: ss[0].userAvatar ?? undefined, // ← sirovi string, NE normaliziraj
    unread: ss.some((s) => !s.viewedByMe),
  }));

  return (
    <>
      <View style={srs.container}>
        <FlatList
          horizontal
          data={["add-btn", ...groups] as any[]}
          keyExtractor={(item, i) =>
            item === "add-btn" ? "add" : `group-${(item as StoryGroup).userId}`
          }
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={srs.list}
          renderItem={({ item }) => {
            // ── Moj story gumb ──
            if (item === "add-btn") {
              const myLatest = myStories[0];
              return (
                <View style={srs.storyItem}>
                  <TouchableOpacity
                    style={[
                      srs.avatarWrap,
                      myLatest ? srs.myHasStory : srs.noStory,
                    ]}
                    onPress={myLatest ? () => setViewing(myLatest) : onAddStory}
                  >
                    {/* Provjeri preset avatar */}
                    {myAvatarUrl && PRESET_AVATARS_MSG[myAvatarUrl] ? (
                      <Image
                        source={PRESET_AVATARS_MSG[myAvatarUrl]}
                        style={srs.img}
                        resizeMode="cover"
                      />
                    ) : myAvatarUrl && !myAvatarUrl.startsWith("avatar:") ? (
                      <Image
                        source={{ uri: myAvatarUrl }}
                        style={srs.img}
                        resizeMode="cover"
                        onError={() => setMyAvatarUrl(null)}
                      />
                    ) : (
                      <View style={srs.addBg}>
                        <Ionicons name="person" size={20} color="#fff" />
                      </View>
                    )}
                    <View style={srs.addIcon}>
                      <Ionicons name="add" size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <Text style={srs.label} numberOfLines={1}>
                    {t("story.myStory")}
                  </Text>
                </View>
              );
            }

            // ── Tuđi story ──
            const g = item as StoryGroup;
            const initials = g.userName?.[0]?.toUpperCase() ?? "?";

            console.log(
              "Story group:",
              g.userName,
              "has stories:",
              g.stories.length,
            ); // Debug

            // U StoriesRow, za tuđi story, makni TouchableOpacity i stavi onPress na StoryIndicator

            return (
              <View style={srs.storyItem}>
                <TouchableOpacity
                  onPress={() => {
                    console.log("Pressed story from:", g.userName);
                    setViewing(g.stories[0]);
                  }}
                  activeOpacity={0.8}
                >
                  <StoryBadge userId={g.userId} size={64}>
                    <View style={srs.avatarWrap}>
                      {g.avatar && PRESET_AVATARS_MSG[g.avatar] ? (
                        <Image
                          source={PRESET_AVATARS_MSG[g.avatar]}
                          style={srs.img}
                          resizeMode="cover"
                        />
                      ) : g.avatar && !g.avatar.startsWith("avatar:") ? (
                        <Image
                          source={{
                            uri: normalizeAvatarUrl(g.avatar) ?? g.avatar,
                          }}
                          style={srs.img}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[srs.addBg, { backgroundColor: "#8e9cf0" }]}
                        >
                          <Text style={srs.initials}>{initials}</Text>
                        </View>
                      )}
                    </View>
                  </StoryBadge>
                </TouchableOpacity>

                <Text style={srs.label} numberOfLines={1}>
                  {g.userName.split(" ")[0]}
                </Text>
              </View>
            );
          }}
        />
      </View>

      {viewing && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {
            console.log("Closing story modal, refreshing stories");
            loadStories(); // Osvježi storyje
            setViewing(null);
          }}
        >
          <StoryViewer
            story={viewing}
            onClose={() => {
              console.log("StoryViewer onClose, refreshing stories");
              loadStories(); // Osvježi storyje
              setViewing(null);
            }}
            onDelete={handleDelete}
            isOwner={viewing.userId === currentUserId}
            onSendMessage={(userId, name) => {
              setViewing(null);
              router.push({
                pathname: "/chat/[userId]",
                params: { userId: userId.toString(), name },
              });
            }}
            currentUserId={currentUserId}
          />
        </Modal>
      )}
    </>
  );
}

// DODAJ OVU FUNKCIJU NEPOSREDNO ISPOD const srs = StyleSheet.create({ ... }) (ili prije StoriesRow komponente)
// ZAMIJENI getSrsStyles funkciju:
const getSrsStyles = (colors: any, M: ReturnType<typeof getM>) =>
  StyleSheet.create({
    container: {
      borderBottomWidth: 1.5,
      borderBottomColor: M.borderBright,
      paddingVertical: 12,
      backgroundColor: M.bg,
    },
    list: { paddingHorizontal: 12, gap: 12 },
    storyItem: { alignItems: "center", width: 72 },
    avatarWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      overflow: "hidden",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    myHasStory: { borderWidth: 2.5, borderColor: M.accent },
    noStory: { borderWidth: 2, borderColor: M.border, borderStyle: "dashed" },
    viewedRing: {
      borderRadius: 32,
      borderWidth: 2,
      borderColor: M.borderBright,
    },
    img: { width: 64, height: 64, borderRadius: 32 },
    addBg: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: M.bgCard,
      justifyContent: "center",
      alignItems: "center",
    },
    initials: { color: M.textPrimary, fontSize: T.screen, fontWeight: "700" },
    addIcon: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: M.accent,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: M.bg,
    },
    label: { fontSize: T.meta, color: M.textMuted, textAlign: "center" },
  });

// ─── Add Story Modal ──────────────────────────────────────────────────────────
function AddStoryModal({
  visible,
  onClose,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const M = useMemo(() => getM(isDark), [isDark]); // ← DODATI
  const asm = useMemo(() => getAsmStyles(colors, M), [M]);
  const [preview, setPreview] = useState<{
    uri: string;
    type: "image" | "video";
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (source: "gallery" | "camera") => {
    const perm =
      source === "gallery"
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result =
      source === "gallery"
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            quality: 1,
          })
        : await ImagePicker.launchCameraAsync({
            mediaTypes: ["images", "videos"],
            quality: 1,
          });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPreview({
        uri: asset.uri,
        type: asset.type === "video" ? "video" : "image",
      });
    }
  };

  const upload = async () => {
    if (!preview) return;
    setUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", {
        uri: preview.uri,
        type: preview.type === "video" ? "video/mp4" : "image/jpeg",
        name: preview.type === "video" ? "story.mp4" : "story.jpg",
      } as any);
      const mediaRes = await fetch(`${API_BASE_URL}/api/upload/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!mediaRes.ok)
        throw new Error(`Media upload failed: ${mediaRes.status}`);
      const mediaData = await mediaRes.json();
      const storyRes = await fetch(`${API_BASE_URL}/api/story/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaUrl: mediaData.url,
          mediaType: preview.type,
        }),
      });
      if (storyRes.ok) {
        setPreview(null);
        onUploaded();
        onClose();
        Alert.alert(t("common.success"), t("story.storyPosted"));
      } else {
        Alert.alert(t("common.error"), t("story.storyFailed"));
      }
    } catch (error) {
      Alert.alert("Greška", "Story nije objavljen. Provjeri konekciju.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: M.bg }}>
        <View style={asm.header}>
          <Text style={asm.title}>{t("story.addStory")}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text
              style={{
                color: M.textMuted,
                fontSize: T.body,
                fontWeight: "600",
              }}
            >
              Zatvori
            </Text>
          </TouchableOpacity>
        </View>
        {!preview ? (
          <View style={asm.pickContainer}>
            <Text style={asm.hint}>{t("story.selectMedia")}</Text>

            <TouchableOpacity
              style={asm.pickBtn}
              onPress={() => pick("gallery")}
            >
              <Ionicons name="images" size={40} color="#2D6418" />
              <Text style={asm.pickLabel}>{t("profile.gallery")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={asm.pickBtn}
              onPress={() => pick("camera")}
            >
              <Ionicons name="camera" size={40} color="#2D6418" />
              <Text style={asm.pickLabel}>{t("profile.camera")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Image
              source={{ uri: preview.uri }}
              style={asm.preview}
              resizeMode="cover"
            />
            <View style={asm.previewActions}>
              <TouchableOpacity
                style={[asm.btn, { backgroundColor: "#ff4757" }]}
                onPress={() => setPreview(null)}
              >
                <Text style={asm.btnText}>{t("common.delete")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[asm.btn, { backgroundColor: "#2D6418" }]}
                onPress={upload}
                disabled={uploading}
              >
                <Text style={asm.btnText}>
                  {uploading ? t("common.loading") : t("story.publish")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ZAMIJENI getAsmStyles funkciju:
const getAsmStyles = (colors: any, M: ReturnType<typeof getM>) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      paddingTop: Platform.OS === "ios" ? 54 : 36,
      borderBottomWidth: 1.5,
      borderBottomColor: M.borderBright,
      backgroundColor: M.bg,
    },
    title: { fontSize: T.title, fontWeight: "800", color: M.textPrimary },
    pickContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 24,
      backgroundColor: M.bg,
    },
    hint: { fontSize: T.lead, color: M.textMuted, marginBottom: 8 },
    pickBtn: {
      width: 160,
      alignItems: "center",
      padding: 28,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: M.accent,
      borderStyle: "dashed",
      gap: 10,
      backgroundColor: M.bgCard,
    },
    pickLabel: { fontSize: T.lead, color: M.accent, fontWeight: "600" },
    preview: { flex: 1 },
    previewActions: {
      flexDirection: "row",
      gap: 12,
      padding: 16,
      backgroundColor: M.bg,
    },
    btn: { flex: 1, padding: 16, borderRadius: 12, alignItems: "center" },
    btnText: { color: M.textPrimary, fontSize: T.lead, fontWeight: "600" },
  });

// ─── Main Messages Screen ─────────────────────────────────────────────────────
export default function MessagesScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const M = useMemo(() => getM(isDark), [isDark]); // ← DODATI
  const styles = useMemo(() => getStyles(colors, isDark, M), [M]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAddStory, setShowAddStory] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = async (silent = false) => {
    if (!silent) setError(null);
    try {
      const storedId = await AsyncStorage.getItem("userId");
      if (storedId) setCurrentUserId(parseInt(storedId));
      const convData = await getConversations();
      setConversations(convData);
      setTotalUnread(convData.reduce((sum, c) => sum + c.unreadCount, 0));
    } catch {
      // Popis se namjerno NE prazni: zadnji uspješno dohvaćeni razgovori
      // ostaju na ekranu. Tiho osvježavanje u pozadini tako ne može
      // zbrisati popis zbog jednog posrnulog odgovora.
      if (!silent) setError(t("messages.loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadConversations();
      // Popis razgovora dolazi jednim zahtjevom (/api/message/conversations).
      // Nekad je isti poziv u kvaru padao na stari put koji je radio 2 + N
      // zahtjeva — zato je razmak ovdje 20s, a ne 8s. Pojedinačni otvoreni
      // razgovor i dalje osvježava svake 4s; ovdje je riječ samo o sažetku.
      // Osvježavanje staje kad aplikacija ode u pozadinu — prije je popis
      // radio zahtjeve i s ugašenim ekranom.
      const stopWhenBackgrounded = (state: AppStateStatus) => {
        if (state === "active") {
          if (!pollRef.current) {
            loadConversations(true);
            pollRef.current = setInterval(() => loadConversations(true), 20000);
          }
        } else if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };

      if (AppState.currentState === "active") {
        pollRef.current = setInterval(() => loadConversations(true), 20000);
      }
      const appStateSub = AppState.addEventListener(
        "change",
        stopWhenBackgrounded,
      );

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        appStateSub.remove();
      };
    }, []),
  );

  const openChat = (userId: number, name: string) => {
    router.push({
      pathname: "/chat/[userId]",
      params: { userId: userId.toString(), name },
    });
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diff === 0)
      return date.toLocaleTimeString("hr-HR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    if (diff === 1) return t("messages.yesterday");
    if (diff < 7) return date.toLocaleDateString("hr-HR", { weekday: "short" });
    return date.toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicatorView />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t("nav.messages")}</Text>
          {totalUnread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalUnread}</Text>
            </View>
          )}
        </View>

        <StoriesRow
          currentUserId={currentUserId}
          onAddStory={() => setShowAddStory(true)}
        />

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#ff3b30" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
          data={conversations}
          keyExtractor={(item) => item.userId.toString()}
          renderItem={({ item }) => (
            <ConversationItem
              item={item}
              onPress={() =>
                openChat(item.userId, `${item.firstName} ${item.lastName}`)
              }
              formatTime={formatTime}
              currentUserId={currentUserId}
              styles={styles}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadConversations();
              }}
              tintColor="#2D6418"
            />
          }
          contentContainerStyle={
            conversations.length === 0
              ? styles.emptyContainer
              : styles.listContent
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={64}
                  color="#d0d0d0"
                />
                <Text style={styles.emptyTitle}>
                  {t("messages.noMessages")}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {t("messages.searchHint")}
                </Text>
                <TouchableOpacity
                  style={styles.newMsgBtn}
                  onPress={() => router.push("/(tabs)/search")}
                >
                  <Text style={styles.newMsgBtnText}>
                    {t("messages.findUsers")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      </View>

      <AddStoryModal
        visible={showAddStory}
        onClose={() => setShowAddStory(false)}
        onUploaded={() => setShowAddStory(false)}
      />
    </SafeAreaView>
  );
}

function ActivityIndicatorView() {
  const { ActivityIndicator } = require("react-native");
  return <ActivityIndicator size="large" color="#2D6418" />;
}

function ConversationItem({
  item,
  onPress,
  formatTime,
  currentUserId,
  styles,
}: {
  item: Conversation;
  onPress: () => void;
  formatTime: (t: string) => string;
  currentUserId?: number | null;
  styles: any;
}) {
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE_URL}/api/auth/users/${item.userId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const userData = await res.json();
        const raw =
          userData.Avatar ||
          userData.avatar ||
          userData.avatarUrl ||
          userData.profileImage ||
          null;
        console.log("raw avatar:", raw);
        if (!raw) return;
        if (raw.startsWith("avatar:")) {
          setAvatarUrl(raw);
          return;
        }
        const normalized = raw.startsWith("http")
          ? raw
          : `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
        setAvatarUrl(
          `${normalized}${normalized.includes("?") ? "&" : "?"}_t=${Date.now()}`,
        );
      } catch {}
    };
    loadAvatar();
  }, [item.userId]);

  const initials =
    `${item.firstName?.[0] ?? ""}${item.lastName?.[0] ?? ""}`.toUpperCase();

  const onPressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.convItem}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
      >
        {/*
          StoryIndicator dodaje JEDAN prsten.
          Avatar unutar njega nema nikakav dodatan border.
        */}
        <StoryBadge userId={item.userId} size={56}>
          {avatarUrl && PRESET_AVATARS_MSG[avatarUrl] ? (
            <Image
              source={PRESET_AVATARS_MSG[avatarUrl]}
              style={{ width: 56, height: 56, borderRadius: 28 }}
              resizeMode="cover"
            />
          ) : avatarUrl && !avatarUrl.startsWith("avatar:") ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 56, height: 56, borderRadius: 28 }}
              onError={() => setAvatarUrl(null)}
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "#2D5518",
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: "#4A7040",
              }}
            >
              <Text
                style={{
                  color: "#E8EDE4",
                  fontSize: T.title,
                  fontWeight: "700",
                }}
              >
                {initials || "?"}
              </Text>
            </View>
          )}
        </StoryBadge>

        <View style={styles.convInfo}>
          <View style={styles.convNameRow}>
            <Text
              style={[
                styles.convName,
                item.unreadCount > 0 && styles.convNameBold,
              ]}
              numberOfLines={1}
            >
              {item.firstName} {item.lastName}
            </Text>
            <Text
              style={[
                styles.convTime,
                item.unreadCount > 0 && styles.convTimeUnread,
              ]}
            >
              {formatTime(item.timestamp)}
            </Text>
          </View>
          <View style={styles.convMsgRow}>
            <Text
              style={[
                styles.convLastMsg,
                item.unreadCount > 0 && styles.convLastMsgUnread,
              ]}
              numberOfLines={1}
            >
              {item.lastMessage}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? "99+" : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Obriši postojeći const styles = StyleSheet.create({ ... }) i zamijeni s ovom funkcijom:

// ZAMIJENI getStyles funkciju:
const getStyles = (colors: any, isDark: boolean, M: ReturnType<typeof getM>) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: M.bg },
    container: { flex: 1, backgroundColor: M.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1.5,
      borderBottomColor: M.borderBright,
      gap: 10,
      backgroundColor: M.bg,
    },
    headerTitle: { fontSize: 28, fontWeight: "bold", color: M.textPrimary },
    badge: {
      backgroundColor: "#ff3b30",
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
      minWidth: 24,
      alignItems: "center",
    },
    badgeText: { color: "#fff", fontSize: T.meta, fontWeight: "700" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: M.errorBg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: M.errorBorder,
    },
    errorText: { fontSize: T.meta, color: "#ff3b30", flex: 1 },
    listContent: { paddingBottom: 24 },
    emptyContainer: { flex: 1 },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: M.bg,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 48,
      paddingTop: 60,
      gap: 12,
    },
    emptyTitle: { fontSize: T.title, fontWeight: "700", color: M.textPrimary },
    emptySubtitle: {
      fontSize: T.body,
      color: M.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    newMsgBtn: {
      marginTop: 8,
      backgroundColor: M.bgCardHover,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: M.accent,
    },
    newMsgBtnText: {
      color: M.textPrimary,
      fontWeight: "600",
      fontSize: T.body,
    },
    convItem: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: M.bgCard,
      backgroundColor: M.bg,
      gap: 12,
    },
    convAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: M.bgCardHover,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    convAvatarText: {
      color: M.textPrimary,
      fontSize: T.title,
      fontWeight: "700",
    },
    convInfo: { flex: 1, gap: 4 },
    convNameRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    convName: {
      fontSize: T.body,
      fontWeight: "500",
      color: M.textPrimary,
      flex: 1,
    },
    convNameBold: { fontWeight: "700", color: M.textPrimary },
    convTime: { fontSize: T.meta, color: M.accentBright, marginLeft: 8 },
    convTimeUnread: { color: M.accent, fontWeight: "600" },
    convMsgRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    convLastMsg: { fontSize: T.body, color: M.textMuted, flex: 1 },
    convLastMsgUnread: { color: M.textSecondary, fontWeight: "600" },
    unreadBadge: {
      backgroundColor: M.unreadBg,
      borderRadius: 12,
      paddingHorizontal: 7,
      paddingVertical: 2,
      minWidth: 22,
      alignItems: "center",
      marginLeft: 8,
      borderWidth: 1,
      borderColor: M.accent,
    },
    unreadBadgeText: {
      color: M.textPrimary,
      fontSize: T.caption,
      fontWeight: "700",
    },
  });
