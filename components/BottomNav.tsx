// components/BottomNav.tsx — Smanjena zelena traka (kocka)
import { router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_ICONS } from "../constants/icons";

// Ikone iz središnjeg registra (nove; stare viking pločice su u LEGACY_ICONS).
const mapIcon = APP_ICONS.navMap;
const videoIcon = APP_ICONS.navVideo;
const messagesIcon = APP_ICONS.navMessages;
const searchIcon = APP_ICONS.navSearch;
const profileIcon = APP_ICONS.navProfile;

interface IconProps {
  active: boolean;
}

function MapIcon({ active }: IconProps) {
  return (
    <Image
      source={mapIcon}
      style={[s.icon, active && s.iconActive]}
      resizeMode="contain"
    />
  );
}

function VideoIcon({ active }: IconProps) {
  return (
    <Image
      source={videoIcon}
      style={[s.icon, active && s.iconActive]}
      resizeMode="contain"
    />
  );
}

function MessagesIcon({ active }: IconProps) {
  return (
    <Image
      source={messagesIcon}
      style={[s.icon, active && s.iconActive]}
      resizeMode="contain"
    />
  );
}

function SearchIcon({ active }: IconProps) {
  return (
    <Image
      source={searchIcon}
      style={[s.icon, active && s.iconActive]}
      resizeMode="contain"
    />
  );
}

function ProfileIcon({ active }: IconProps) {
  return (
    <Image
      source={profileIcon}
      style={[s.icon, active && s.iconActive]}
      resizeMode="contain"
    />
  );
}

const TAB_ICONS = {
  "/(tabs)": MapIcon,
  "/(tabs)/videos": VideoIcon,
  "/(tabs)/messages": MessagesIcon,
  "/(tabs)/search": SearchIcon,
  "/(tabs)/profile": ProfileIcon,
};

export default function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const TABS = [
    { route: "/(tabs)", label: t("nav.map") },
    { route: "/(tabs)/videos", label: t("nav.videos") },
    { route: "/(tabs)/messages", label: t("nav.messages") },
    { route: "/(tabs)/search", label: t("nav.search") },
    { route: "/(tabs)/profile", label: t("nav.profile") },
  ] as const;

  const isActive = (route: string) => {
    if (route === "/(tabs)") {
      return (
        pathname === "/" || pathname === "/(tabs)" || pathname === "/index"
      );
    }

    return pathname.startsWith(route.replace("/(tabs)", ""));
  };

  return (
    <View style={[s.wrapper, { paddingBottom: insets.bottom }]}>
      <View style={s.topBorderOuter} />
      <View style={s.topBorderInner} />

      <View style={s.nav}>
        {TABS.map((tab) => {
          const active = isActive(tab.route);
          const IconComponent = TAB_ICONS[tab.route as keyof typeof TAB_ICONS];

          return (
            <TouchableOpacity
              key={tab.route}
              style={s.tab}
              onPress={() => {
                // replace, ne push: push slaže svaki posjećeni tab na
                // navigacijski stog i nikad ga ne skida (nema "back" gumba
                // koji bi ga skinuo), pa su svi prije posjećeni tabovi
                // ostajali montirani zauvijek u pozadini — zajedno sa SVIM
                // svojim pollinzima (npr. StoryBadge svakih 30s, poruke
                // svakih 8s), što je trošilo bateriju/mrežu i memoriju.
                if (!active) router.replace(tab.route as any);
              }}
              activeOpacity={1}
              pressRetentionOffset={0}
            >
              {/* SMANJENA KOCKASTA POZADINA */}
              <View style={s.iconWrapBackground}>
                <View style={[s.iconWrap, active && s.iconWrapActive]}>
                  <IconComponent active={active} />
                </View>
              </View>
              {/* Natpis ispod ikone: pet sličnih metalnih pločica bez teksta
                  ne govori koja vodi kamo. Naziv se već računao za svaki tab
                  (nav.map, nav.videos…), samo se nikad nije prikazivao. */}
              <Text
                style={[s.label, active && s.labelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1A2E15",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },

  topBorderOuter: {
    height: 1.5,
    backgroundColor: "#4A7040",
  },

  topBorderInner: {
    height: 0.5,
    backgroundColor: "#0D1A09",
  },

  nav: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 8 : 10,
    paddingHorizontal: 8,
    backgroundColor: "#1A2E15",
  },

  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    position: "relative",
  },

  // SMANJENA KOCKASTA POZADINA
  iconWrapBackground: {
    backgroundColor: "rgba(45,100,24,0.2)",
    borderRadius: 8, // SMANJENO sa 12 na 8
    padding: 4, // SMANJENO sa 8 na 4 (ključno za smanjenje)
  },

  iconWrap: {
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },

  iconWrapActive: {
    // Bez promjene za aktivnu ikonu
  },

  icon: {
    width: 38,
    height: 38,
  },

  label: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: "#8FA886",
    textAlign: "center",
  },

  labelActive: {
    color: "#D8E8CC",
  },

  iconActive: {
    opacity: 1,
  },
});
