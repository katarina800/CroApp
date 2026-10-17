// app/StoryBadge.tsx
// FIX: Koristi ispravan endpoint /api/story/has-story/{userId}
// koji provjerava ima li korisnik BILO KOJI aktivan story (neovisno o tome tko gleda)

import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { API_BASE_URL } from "./config/api";
import { useActivePolling } from "@/hooks/use-active-polling";
import { getToken } from "@/utils/tokenStore";

interface StoryBadgeProps {
  userId: number;
  size?: number;
  children: React.ReactNode;
}

export function StoryBadge({ userId, size = 56, children }: StoryBadgeProps) {
  const [hasActiveStory, setHasActiveStory] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!userId || userId === 0) return;
    checkHasStory();
    // Svaki mountani StoryBadge (jedan po avataru — u listi pratitelja to
    // može biti desetke odjednom) pollao je NEOVISNO svakih 30s; produženo
    // na 90s da se smanji potrošnja baterije/mreže bez da priče postanu
    // primjetno "zastarjele".
  }, [userId]);

  // Ponavljanje samo u prvom planu: u popisu pratitelja može biti desetak
  // ovakvih značaka, a svaka je i u pozadini slala vlastiti zahtjev.
  useActivePolling(() => checkHasStory(), 90000, !!userId && userId !== 0);

  // Pulsacija samo kad postoji story
  useEffect(() => {
    if (!hasActiveStory) {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.07,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [hasActiveStory]);

  const checkHasStory = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      // Endpoint koji provjerava ima li korisnik (userId) aktivnih storija
      // Ovo je novi endpoint koji si dodao u StoryController
      const res = await fetch(`${API_BASE_URL}/api/story/has-story/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHasActiveStory(data.hasActiveStory === true);
      } else {
        // Endpoint ne postoji ili je greška → ne prikazuj prsten
        setHasActiveStory(false);
      }
    } catch {
      setHasActiveStory(false);
    }
  };

  const ringSize = size + 8;
  const ringRadius = ringSize / 2;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {children}
      {hasActiveStory && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringRadius,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 2.5,
    borderColor: "#667eea",
    backgroundColor: "transparent",
    // iOS
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
    // Android
    elevation: 5,
  },
});

export default StoryBadge;
