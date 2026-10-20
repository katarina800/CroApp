// components/MediaPager.tsx
//
// Pregled objava prelistavanjem.
//
// U profilu ("Moje") i na tuđem profilu ("Aktivnosti") objava se otvarala
// pojedinačno: da se vidi sljedeća, prethodnu je trebalo zatvoriti pa se
// vratiti u mrežicu i pogoditi sličicu. Kod desetak objava to je više
// zatvaranja nego gledanja.
//
// Ovdje se otvori ona koju si dotaknuo, a ostale su lijevo i desno. Ista
// komponenta služi oba mjesta, da se pregled ne razilazi u dvije verzije.

import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CloseButton } from "./CloseButton";
import { T } from "../styles/varaTheme";

/** Objava u pregledu. Polja koja objava nema jednostavno se ne prikažu. */
export interface PagerItem {
  id: number | string;
  /** Puna adresa slike ili videa. */
  url: string;
  isVideo: boolean;
  title?: string | null;
  location?: string | null;
  /** Opis objave; već sadrži "Kategorije" i "Primjereno za". */
  description?: string | null;
  isEvent?: boolean;
  eventStartAt?: string | null;
  authorName?: string | null;
}

/** Isti oblik kao u videima: "20.09.2026. - 12:00". */
function eventWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Jedna stranica — samo medij, preko cijele visine.
 *
 * Podaci su prije stajali ispod slike i na duljim opisima ispadali ispod
 * ruba ekrana: baš ono što se htjelo pročitati (kategorije, "primjereno
 * za") bilo je odrezano. Sada ih otvara gumb u zaglavlju, u vlastitom
 * prozoru gdje ima mjesta za sve.
 *
 * Zaseban komponent jer svaki video treba svoj player, a playeri se rade
 * hookom — koji se ne smije zvati u petlji. Svira samo onaj na vidljivoj
 * stranici; ostali stoje, inače bi se čulo troje odjednom.
 */
function PagerPage({
  item,
  isActive,
  width,
  height,
}: {
  item: PagerItem;
  isActive: boolean;
  width: number;
  height: number;
}) {
  const player = useVideoPlayer(item.isVideo ? item.url : null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (!item.isVideo) return;
    try {
      if (isActive) player.play();
      else player.pause();
    } catch {
      // Player zna biti otpušten prije nego efekt stigne — nije razlog za pad.
    }
  }, [isActive, item.isVideo, player]);

  return (
    <View style={{ width, height }}>
      {/* Okvir u Vara stilu: zaobljen, zelenog ruba, nikad crna ploha. */}
      <View
        style={{
          flex: 1,
          marginHorizontal: 14,
          marginTop: 4,
          borderRadius: 22,
          overflow: "hidden",
          borderWidth: 1.5,
          borderColor: "#4A7040",
          backgroundColor: "#16301a",
        }}
      >
        {item.isVideo ? (
          <VideoView
            player={player}
            style={{ flex: 1 }}
            contentFit="contain"
            nativeControls
          />
        ) : (
          <>
            {/* Zamućena kopija iste slike puni prazan prostor oko nje
                (panorame i uski kadrovi), umjesto crnih traka. */}
            <Image
              source={{ uri: item.url }}
              blurRadius={28}
              resizeMode="cover"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.55,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(18,37,14,0.45)",
              }}
            />
            <Image
              source={{ uri: item.url }}
              style={{ flex: 1 }}
              resizeMode="contain"
            />
          </>
        )}
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, minHeight: 66 }}>
        {!!item.title && (
          <Text
            style={{ color: "#E8EDE4", fontSize: T.lead, fontWeight: "800" }}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        )}
        {!!item.location && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 3,
            }}
          >
            <Ionicons name="location-outline" size={14} color="#97A192" />
            <Text
              style={{ flex: 1, color: "#97A192", fontSize: T.meta }}
              numberOfLines={1}
            >
              {item.location}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Podaci o objavi, u vlastitom prozoru.
 *
 * Listić se diže s dna i zauzima najviše tri četvrtine ekrana; sadržaj se
 * unutar njega pomiče, pa i dugačak opis stane bez odsijecanja.
 */
function DetailsSheet({
  item,
  visible,
  onClose,
}: {
  item: PagerItem | undefined;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)" }}
        onPress={onClose}
      >
        <View style={{ flex: 1 }} />
        <Pressable
          style={{
            maxHeight: "75%",
            backgroundColor: "#16301a",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: "#2f5a33",
            paddingBottom: 28,
          }}
          onPress={() => {}}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 18,
              paddingTop: 16,
              paddingBottom: 10,
            }}
          >
            <Text
              style={{ color: "#fff", fontSize: T.lead, fontWeight: "800" }}
            >
              {t("pager.detailsTitle")}
            </Text>
            <CloseButton onPress={onClose} tone="light" />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }}
          >
            {!!item.authorName && (
              <Text
                style={{
                  color: "#8fd06a",
                  fontSize: T.body,
                  fontWeight: "700",
                }}
              >
                {item.authorName}
              </Text>
            )}
            {!!item.title && (
              <Text
                style={{ color: "#fff", fontSize: T.title, fontWeight: "800" }}
              >
                {item.title}
              </Text>
            )}
            {!!item.location && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons name="location-outline" size={16} color="#b6cfae" />
                <Text style={{ color: "#dcdcdc", fontSize: T.body, flex: 1 }}>
                  {item.location}
                </Text>
              </View>
            )}
            {item.isEvent && item.eventStartAt && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  alignSelf: "flex-start",
                  backgroundColor: "rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Ionicons name="calendar" size={15} color="#fff" />
                <Text
                  style={{ color: "#fff", fontSize: T.body, fontWeight: "700" }}
                >
                  {t("post.eventStarts", {
                    when: eventWhen(item.eventStartAt),
                  })}
                </Text>
              </View>
            )}
            {!!item.description && (
              <Text
                style={{ color: "#d0d8cc", fontSize: T.body, lineHeight: 23 }}
              >
                {item.description}
              </Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function MediaPager({
  visible,
  items,
  initialIndex = 0,
  onClose,
  onDelete,
}: {
  visible: boolean;
  items: PagerItem[];
  initialIndex?: number;
  onClose: () => void;
  /** Kad je zadano, u zaglavlju stoji i gumb za brisanje trenutne objave. */
  onDelete?: (item: PagerItem) => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<PagerItem>>(null);

  const [index, setIndex] = useState(initialIndex);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [bodyH, setBodyH] = useState(0);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setDetailsOpen(false);
    }
  }, [visible, initialIndex]);

  const current = items[index];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#12250E" }}
        edges={["top", "bottom"]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 14,
              backgroundColor: "#243B1E",
              borderWidth: 1,
              borderColor: "#4A7040",
            }}
          >
            <Text
              style={{ color: "#E8EDE4", fontSize: T.meta, fontWeight: "800" }}
            >
              {items.length > 0 ? `${index + 1} / ${items.length}` : ""}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {/* Podaci o objavi. Otvaraju se preko slike, pa ih duljina
                opisa ne može istjerati ispod ruba ekrana. */}
            <TouchableOpacity
              onPress={() => setDetailsOpen(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t("pager.detailsTitle")}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#243B1E",
                borderWidth: 1.5,
                borderColor: "#B8A060",
              }}
            >
              <Ionicons name="information" size={20} color="#B8A060" />
            </TouchableOpacity>

            {onDelete && current && (
              <TouchableOpacity
                onPress={() => onDelete(current)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t("common.delete")}
              >
                <Ionicons name="trash-outline" size={22} color="#ff6b6b" />
              </TouchableOpacity>
            )}

            <CloseButton onPress={onClose} tone="light" />
          </View>
        </View>

        {/* Visina stranice = stvarno slobodno mjesto, ne cijeli ekran. */}
        <View
          style={{ flex: 1 }}
          onLayout={(e) => setBodyH(Math.round(e.nativeEvent.layout.height))}
        >
          {bodyH > 0 && (
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={(it) => String(it.id)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              // Bez getItemLayout initialScrollIndex na dugačkim popisima
              // promaši stranicu, jer FlatList još ne zna koliko je koja široka.
              getItemLayout={(_, i) => ({
                length: width,
                offset: width * i,
                index: i,
              })}
              onMomentumScrollEnd={(e) => {
                const next = Math.round(e.nativeEvent.contentOffset.x / width);
                if (next !== index) setIndex(next);
              }}
              renderItem={({ item, index: i }) => (
                <PagerPage
                  item={item}
                  isActive={i === index}
                  width={width}
                  height={bodyH}
                />
              )}
            />
          )}
        </View>

        {/* Točkice: gdje sam u nizu (za dugačke nizove ih nema — brojač je gore). */}
        {items.length > 1 && items.length <= 12 && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
            }}
          >
            {items.map((it, i) => (
              <View
                key={String(it.id)}
                style={{
                  width: i === index ? 20 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === index ? "#B8A060" : "#4A7040",
                }}
              />
            ))}
          </View>
        )}

        <DetailsSheet
          item={current}
          visible={detailsOpen}
          onClose={() => setDetailsOpen(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}
