import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSession } from "../../hooks/useSession";
import { apiFetch } from "../../lib/api";

const BG = "#080808";
const TEXT = "#F5F0E8";
const ACCENT = "#C0392B";
const GOLD = "#D4A017";

type VideoItem = {
  id: string;
  title: string;
  thumbnail_url?: string | null;
  created_at?: string | null;
};

function parseVideos(data: unknown): VideoItem[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map((v, i) => normalizeVideo(v, i));
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const list = (o.videos ?? o.data ?? o.items) as unknown;
    if (Array.isArray(list)) {
      return list.map((v, i) => normalizeVideo(v, i));
    }
  }
  return [];
}

function normalizeVideo(v: unknown, index: number): VideoItem {
  if (!v || typeof v !== "object") {
    return { id: String(index), title: "Vidéo" };
  }
  const o = v as Record<string, unknown>;
  return {
    id: String(o.id ?? o.slug ?? index),
    title: String(o.title ?? o.name ?? "Sans titre"),
    thumbnail_url: o.thumbnail_url
      ? String(o.thumbnail_url)
      : o.thumbnail
        ? String(o.thumbnail)
        : null,
    created_at: o.created_at
      ? String(o.created_at)
      : o.published_at
        ? String(o.published_at)
        : null,
  };
}

export default function AccueilScreen() {
  const { member, isLoading: sessionLoading } = useSession();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVideos = useCallback(async () => {
    try {
      const data = await apiFetch<unknown>("/api/videos");
      setVideos(parseVideos(data));
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadVideos();
  }, [loadVideos]);

  const name = member?.display_name ?? "Membre";
  const points =
    member?.points_pmq !== undefined ? String(member.points_pmq) : "—";
  const lastRedist =
    member?.derniere_redistribution?.trim() || "Aucune à ce jour";

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>LEVE</Text>
      </View>

      <Text style={styles.welcome}>
        Bienvenue{sessionLoading ? "" : `, ${name}`}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Points PMQ</Text>
          <Text style={styles.statValue}>{points}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Dernière redistribution</Text>
          <Text style={styles.statValueSmall}>{lastRedist}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Vidéos récentes</Text>
      {loading ? (
        <ActivityIndicator color={ACCENT} style={styles.loader} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={ACCENT}
              colors={[ACCENT]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucune vidéo pour le moment.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.videoRow}>
              {item.thumbnail_url ? (
                <Image
                  source={{ uri: item.thumbnail_url }}
                  style={styles.thumb}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]} />
              )}
              <View style={styles.videoText}>
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.created_at ? (
                  <Text style={styles.videoMeta}>{item.created_at}</Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 48,
  },
  header: {
    backgroundColor: BG,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    color: TEXT,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 4,
  },
  welcome: {
    color: TEXT,
    fontSize: 18,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#121212",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#222",
  },
  statLabel: {
    color: "#a39e96",
    fontSize: 12,
    marginBottom: 6,
  },
  statValue: {
    color: GOLD,
    fontSize: 22,
    fontWeight: "700",
  },
  statValueSmall: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
  },
  sectionTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  loader: { marginTop: 24 },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  empty: {
    color: "#8a8580",
    paddingVertical: 24,
  },
  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 12,
  },
  thumb: {
    width: 96,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
  },
  thumbPlaceholder: {
    borderWidth: 1,
    borderColor: "#333",
  },
  videoText: { flex: 1 },
  videoTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "600",
  },
  videoMeta: {
    color: "#8a8580",
    fontSize: 12,
    marginTop: 4,
  },
});
