import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "../../lib/api";

const BG = "#080808";
const TEXT = "#F5F0E8";
const ACCENT = "#C0392B";
const GOLD = "#D4A017";

export type ClassementRow = {
  rank: number;
  display_name: string;
  member_type: string;
  points: number;
};

function parseClassement(data: unknown): ClassementRow[] {
  let list: unknown[] = [];
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const inner = (o.members ?? o.classement ?? o.leaderboard ?? o.rows) as
      | unknown[]
      | undefined;
    if (Array.isArray(inner)) list = inner;
  }
  return list.slice(0, 100).map((row, index) => {
    if (!row || typeof row !== "object") {
      return {
        rank: index + 1,
        display_name: "—",
        member_type: "",
        points: 0,
      };
    }
    const r = row as Record<string, unknown>;
    return {
      rank: Number(r.rank ?? r.position ?? index + 1) || index + 1,
      display_name: String(r.display_name ?? r.name ?? "—"),
      member_type: String(r.member_type ?? r.type ?? ""),
      points: Number(r.points ?? r.points_pmq ?? 0) || 0,
    };
  });
}

export default function ClassementScreen() {
  const [rows, setRows] = useState<ClassementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<unknown>("/api/classement");
      setRows(parseClassement(data));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      void load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Classement</Text>
      <Text style={styles.subtitle}>Top 100 · mise à jour auto (30s)</Text>
      <FlatList
        data={rows}
        keyExtractor={(item, i) => `${item.rank}-${item.display_name}-${i}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT}
            colors={[ACCENT]}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucune donnée.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{item.rank}</Text>
            <View style={styles.mid}>
              <Text style={styles.name} numberOfLines={1}>
                {item.display_name}
              </Text>
              {item.member_type ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.member_type}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.points}>{item.points}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingTop: 48 },
  center: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: TEXT,
    fontSize: 26,
    fontWeight: "800",
    paddingHorizontal: 20,
  },
  subtitle: {
    color: "#8a8580",
    fontSize: 13,
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 4,
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { color: "#8a8580", textAlign: "center", marginTop: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#121212",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
    gap: 12,
  },
  rank: {
    width: 36,
    color: GOLD,
    fontWeight: "800",
    fontSize: 16,
    textAlign: "center",
  },
  mid: { flex: 1, minWidth: 0 },
  name: { color: TEXT, fontSize: 16, fontWeight: "600" },
  badge: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#2a1512",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  badgeText: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  points: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
    minWidth: 48,
    textAlign: "right",
  },
});
