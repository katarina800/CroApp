import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../app/config/api";
import i18n from "../app/config/i18n";
import { getToken } from "@/utils/tokenStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  isRead: boolean;
  sentAt: string;
  senderName?: string;
  receiverName?: string;
}

export interface Conversation {
  userId: number;
  firstName: string;
  lastName: string;
  username?: string;
  avatar?: string | null;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Poruke sa slikom/videom se šalju kao poseban tekstualni marker + JSON
// (npr. "__CROMAP_IMAGE__{"url":"..."}") koji chat ekran prepoznaje i
// prikazuje kao pravu sliku/video. Popis razgovora prije nije znao za taj
// format pa je korisniku prikazivao sirovi marker i URL umjesto razumljivog
// pregleda poput drugih aplikacija za poruke. Tekst je pune rečenice i
// prevodi se na jezik koji je korisnik odabrao (bez ikona ispred).
function formatLastMessagePreview(content: string, sentByMe: boolean): string {
  if (content?.startsWith("__CROMAP_IMAGE__")) {
    return sentByMe
      ? i18n.t("messages.youSentImage")
      : i18n.t("messages.userSentYouImage");
  }
  if (content?.startsWith("__CROMAP_VIDEO__")) {
    return sentByMe
      ? i18n.t("messages.youSentVideo")
      : i18n.t("messages.userSentYouVideo");
  }
  return content;
}

export const getCurrentUserId = async (): Promise<number | null> => {
  const stored = await AsyncStorage.getItem("userId");
  if (stored && stored !== "0") return parseInt(stored, 10);

  // Fallback: parse from JWT
  const token = await getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const uid =
      payload[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
      ];
    return uid ? parseInt(uid, 10) : null;
  } catch {
    return null;
  }
};

// ─── API calls ────────────────────────────────────────────────────────────────

/** Avatar iz baze pretvori u nešto što <Image> može prikazati.
 *  Preset avatari ("avatar:male"/"avatar:female") nisu URL-ovi — za njih
 *  vraćamo null pa se prikažu inicijali, kao i dosad. */
const toAvatarUrl = (raw?: string | null): string | null => {
  if (!raw || raw.trim() === "" || raw.startsWith("avatar:")) return null;
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
};

/**
 * Popis razgovora — samo korisnici s kojima stvarno postoji razmijenjena
 * poruka. Backend to vraća jednim upitom (/api/message/conversations).
 *
 * Ovdje je nekad stajao i "stari način" za verziju backenda bez tog
 * endpointa: spoji pratitelje i praćene, pa ZA SVAKOG dohvati cijeli
 * razgovor samo da se pročita zadnja poruka. Problem nije bio u tome što
 * je spor, nego kada se pokretao — na SVAKI odgovor koji nije bio `ok`,
 * dakle i na 401, i na 500, i na kratki ispad mreže.
 *
 * Popis razgovora se osvježava svakih 20 sekundi. Jedan posrnuli odgovor
 * time nije značio jednu promašenu provjeru, nego 2 + N novih zahtjeva, uz
 * preuzimanje svih poruka svakog razgovora. Trideset kontakata je tako iz
 * jednog neuspjeha izvlačilo tridesetak zahtjeva — i to je razlog zašto je
 * opći limit na poslužitelju morao s 300 skočiti na 900 zahtjeva u minuti:
 * korisnici su dobivali 429 na nepovezanim radnjama ("failed to send").
 *
 * Endpoint na poslužitelju postoji od MessageController.cs, pa je taj put
 * bio mrtav kod koji se budio isključivo u kvaru — i kvar pogoršavao.
 * Sada se greška prijavi i popis ostaje onakav kakav je bio.
 */
export const getConversations = async (): Promise<Conversation[]> => {
  const token = await getToken();
  const userId = await getCurrentUserId();

  if (!token || !userId) throw new Error("Not authenticated");

  const res = await fetch(`${API_BASE_URL}/api/message/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Popis razgovora nije dohvaćen (${res.status})`);
  }

  const rows: any[] = await res.json();

  return rows.map((r) => ({
    userId: r.userId,
    firstName: r.firstName,
    lastName: r.lastName,
    username: r.username,
    avatar: toAvatarUrl(r.avatar),
    lastMessage: formatLastMessagePreview(
      r.lastMessage ?? "",
      r.lastMessageSenderId === userId,
    ),
    timestamp: r.timestamp,
    unreadCount: r.unreadCount ?? 0,
  }));
};

/**
 * Dohvati sve poruke s određenim korisnikom.
 */
export const getConversationMessages = async (
  otherUserId: number,
): Promise<Message[]> => {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `${API_BASE_URL}/api/message/conversation/${otherUserId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error("Failed to fetch conversation");
  return res.json();
};

/**
 * Pošalji poruku korisniku. Vraća i status kod da pozivatelj može
 * razlikovati "previše zahtjeva" (429, privremeno, pokušaj kasnije) od
 * stvarnog neuspjeha — dosad se oboje prikazivalo kao ista generička
 * "poruka nije poslana" greška.
 */
export const sendMessage = async (
  receiverId: number,
  content: string,
): Promise<{ ok: boolean; rateLimited: boolean }> => {
  const token = await getToken();
  if (!token) return { ok: false, rateLimited: false };

  const res = await fetch(`${API_BASE_URL}/api/message/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ receiverId, content }),
  });
  return { ok: res.ok, rateLimited: res.status === 429 };
};

/**
 * Označi poruku kao pročitanu.
 */
export const markAsRead = async (messageId: number): Promise<void> => {
  const token = await getToken();
  if (!token) return;

  await fetch(`${API_BASE_URL}/api/message/read/${messageId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
};

/**
 * Dohvati broj nepročitanih poruka.
 */
export const getUnreadCount = async (): Promise<number> => {
  const token = await getToken();
  if (!token) return 0;

  const res = await fetch(`${API_BASE_URL}/api/message/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.unreadCount ?? 0;
};

/**
 * Dohvati avatar korisnika po ID-u.
 */
export const getUserAvatar = async (userId: number): Promise<string | null> => {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const userData = await res.json();
      if (userData.avatar) {
        return userData.avatar.startsWith("http")
          ? userData.avatar
          : `${API_BASE_URL}${userData.avatar}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching user avatar:", error);
    return null;
  }
};
