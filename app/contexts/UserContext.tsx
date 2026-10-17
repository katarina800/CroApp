// contexts/UserContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { API_BASE_URL } from "../config/api";
import { getToken } from "@/utils/tokenStore";

interface UserProfile {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  avatar?: string | null;
  followersCount: number;
  followingCount: number;
  isPublic: boolean;
  showUsername?: boolean;
}

interface UserContextType {
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateAvatar: (avatarUrl: string) => void;
  resetProfile: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/auth/my-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const updateAvatar = useCallback((avatarUrl: string) => {
    setProfile((prev) =>
      prev ? { ...prev, avatar: avatarUrl || null } : prev,
    );
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(null);
  }, []);

  // Učitaj profil pri mountanju providera
  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Memoizirano — inače bi Provider na svaki render UserProvider-a
  // (uključujući onaj izazvan bilo kojim drugim contextom iznad njega)
  // proslijedio novi objekt i re-renderirao sve potrošače useUser().
  const value = useMemo(
    () => ({ profile, loading, refreshProfile, updateAvatar, resetProfile }),
    [profile, loading, refreshProfile, updateAvatar, resetProfile],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export default UserProvider;
