// components/UserAvatar.tsx
// Reusable avatar: slika → muški avatar → ženski avatar → inicijali
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { API_BASE_URL } from "../app/config/api";
import { getToken } from "@/utils/tokenStore";
const AVATAR_MALE = require("../assets/images/avatar-male.png");
const AVATAR_FEMALE = require("../assets/images/avatar-female.png");

interface UserAvatarProps {
  userId?: number;
  avatar?: string | null;
  firstName?: string;
  lastName?: string;
  size?: number;
  backgroundColor?: string;
  style?: object;
}

/** Konvertira avatar prop u potpuni URL ili null */
function resolveAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar || avatar.startsWith("avatar:")) return null;
  if (avatar.startsWith("http")) return avatar;
  return `${API_BASE_URL}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

/** Inicijali iz imena i prezimena */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

/** Mali muški SVG avatar (skraćena verzija - samo glava/ramena) */
function MaleIcon({ size }: { size: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="bgM2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#2D6418" />
          <Stop offset="100%" stopColor="#142F09" />
        </LinearGradient>
      </Defs>
      <Path d="M0 0 L100 0 L100 100 L0 100 Z" fill="url(#bgM2)" />
      <Path d="M22 100 L22 72 Q50 62 78 72 L78 100 Z" fill="#8A9898" />
      <Path d="M43 58 L43 68 Q50 72 57 68 L57 58 Z" fill="#D4A574" />
      <Path
        d="M33 38 Q33 20 50 20 Q67 20 67 38 Q67 56 50 58 Q33 56 33 38 Z"
        fill="#D4A574"
      />
      <Path
        d="M33 36 Q32 18 50 18 Q68 18 67 36 Q65 22 50 20 Q35 22 33 36 Z"
        fill="#3A2A1A"
      />
      <Path d="M38 37 Q41 35 44 37 Q41 40 38 37 Z" fill="#2A1A0A" />
      <Path d="M56 37 Q59 35 62 37 Q59 40 56 37 Z" fill="#2A1A0A" />
      <Path
        d="M44 51 Q50 55 56 51"
        fill="none"
        stroke="#8B5E3C"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Mali ženski SVG avatar */
function FemaleIcon({ size }: { size: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="bgF2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#2D6418" />
          <Stop offset="100%" stopColor="#142F09" />
        </LinearGradient>
      </Defs>
      <Path d="M0 0 L100 0 L100 100 L0 100 Z" fill="url(#bgF2)" />
      <Path d="M22 100 L22 70 Q50 58 78 70 L78 100 Z" fill="#A8B8A8" />
      <Path d="M43 57 L43 68 Q50 71 57 68 L57 57 Z" fill="#E8B896" />
      <Path
        d="M33 38 Q33 20 50 20 Q67 20 67 38 Q67 56 50 58 Q33 56 33 38 Z"
        fill="#E8B896"
      />
      <Path
        d="M33 36 Q32 16 50 15 Q68 16 67 36 Q65 20 50 18 Q35 20 33 36 Z"
        fill="#4A2A0A"
      />
      <Path d="M33 36 Q28 45 30 56 Q32 52 33 48 Z" fill="#4A2A0A" />
      <Path d="M67 36 Q72 45 70 56 Q68 52 67 48 Z" fill="#4A2A0A" />
      <Path d="M37 37 Q41 34 45 37 Q41 41 37 37 Z" fill="#2A1A0A" />
      <Path d="M55 37 Q59 34 63 37 Q59 41 55 37 Z" fill="#2A1A0A" />
      <Path
        d="M43 51 Q50 56 57 51"
        fill="none"
        stroke="#C04060"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function UserAvatar({
  userId,
  avatar: propAvatar,
  firstName = "",
  lastName = "",
  size = 40,
  backgroundColor = "#2D6418",
  style,
}: UserAvatarProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() =>
    resolveAvatarUrl(propAvatar),
  );
  const [fetchedFirstName, setFetchedFirstName] = useState("");
  const [fetchedLastName, setFetchedLastName] = useState("");
  // ── DODANO ──
  const [fetchedAvatar, setFetchedAvatar] = useState<string | null | undefined>(
    propAvatar,
  );
  // ────────────
  // Neke slike (uglavnom snimljene prije migracije na Cloudflare R2) više
  // ne postoje na serveru — bez ovoga bi <Image> samo tiho ostao prazan.
  // Sad se u tom slučaju vraćamo na inicijale umjesto praznog kruga.
  const [imageFailed, setImageFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Ako je prop avatar eksplicitno postavljen, koristi njega
    if (propAvatar !== undefined && propAvatar !== null && propAvatar !== "") {
      setFetchedAvatar(propAvatar);
      setResolvedUrl(resolveAvatarUrl(propAvatar));
      setImageFailed(false);
      return;
    }
    if (userId) {
      (async () => {
        try {
          const token = await getToken();
          if (!token) return;
          const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok && mountedRef.current) {
            const data = await res.json();
            if (mountedRef.current) {
              // ── DODANO: spremi cijeli avatar string ──
              setFetchedAvatar(data.avatar ?? null);
              setResolvedUrl(resolveAvatarUrl(data.avatar));
              setImageFailed(false);
              if (data.firstName) setFetchedFirstName(data.firstName);
              if (data.lastName) setFetchedLastName(data.lastName);
            }
          }
        } catch {}
      })();
    } else {
      setResolvedUrl(null);
      setFetchedAvatar(null);
    }
  }, [userId, propAvatar]);

  const radius = size / 2;
  // ── PROMIJENJENO: koristi fetchedAvatar umjesto propAvatar ──
  const isMale = fetchedAvatar === "avatar:male";
  const isFemale = fetchedAvatar === "avatar:female";
  // ───────────────────────────────────────────────────────────

  if (resolvedUrl && !isMale && !isFemale && !imageFailed) {
    return (
      <Image
        source={{ uri: resolvedUrl }}
        style={[{ width: size, height: size, borderRadius: radius }, style]}
        onError={() => setImageFailed(true)}
      />
    );
  }
  if (isMale) {
    return (
      <Image
        source={AVATAR_MALE}
        style={[{ width: size, height: size, borderRadius: radius }, style]}
        resizeMode="cover"
      />
    );
  }
  if (isFemale) {
    return (
      <Image
        source={AVATAR_FEMALE}
        style={[{ width: size, height: size, borderRadius: radius }, style]}
        resizeMode="cover"
      />
    );
  }

  const displayFirstName = fetchedFirstName || firstName;
  const displayLastName = fetchedLastName || lastName;
  const initials = getInitials(displayFirstName, displayLastName);
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: radius, backgroundColor },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  initials: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
  },
});
