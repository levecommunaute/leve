import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiFetch } from "../../lib/api";

const BG = "#080808";
const TEXT = "#F5F0E8";
const ACCENT = "#C0392B";
const GOLD = "#D4A017";

type Transaction = {
  id: string;
  label: string;
  amount: number;
  date?: string | null;
};

type SoldePayload = {
  solde: number;
  transactions: Transaction[];
};

function parseSolde(data: unknown): SoldePayload {
  if (!data || typeof data !== "object") {
    return { solde: 0, transactions: [] };
  }
  const o = data as Record<string, unknown>;
  const solde = Number(
    o.solde ?? o.balance ?? o.solde_pmq ?? o.pmq_balance ?? 0
  );
  const rawTx = (o.transactions ?? o.history ?? o.mouvements) as
    | unknown[]
    | undefined;
  const transactions: Transaction[] = Array.isArray(rawTx)
    ? rawTx.map((t, i) => {
        if (!t || typeof t !== "object") {
          return { id: String(i), label: "—", amount: 0 };
        }
        const x = t as Record<string, unknown>;
        return {
          id: String(x.id ?? i),
          label: String(
            x.label ?? x.description ?? x.motif ?? x.type ?? "Opération"
          ),
          amount: Number(x.amount ?? x.montant ?? x.value ?? 0),
          date: x.date
            ? String(x.date)
            : x.created_at
              ? String(x.created_at)
              : null,
        };
      })
    : [];
  return { solde: Number.isFinite(solde) ? solde : 0, transactions };
}

export default function BanqueScreen() {
  const [solde, setSolde] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<unknown>("/api/membre/solde");
      const p = parseSolde(data);
      setSolde(p.solde);
      setTransactions(p.transactions);
    } catch {
      setSolde(0);
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const transferDisabled = solde < 100;

  return (
    <View style={styles.root}>
      <Text style={styles.screenTitle}>Banque PMQ</Text>
      {loading ? (
        <ActivityIndicator color={ACCENT} style={styles.loader} />
      ) : null}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Solde PMQ</Text>
        <Text style={styles.balanceValue}>
          ${solde.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.transferBtn, transferDisabled && styles.transferOff]}
        disabled={transferDisabled}
        onPress={() => {
          /* navigation vers transfert si prévu */
        }}
      >
        <Text
          style={[
            styles.transferLabel,
            transferDisabled && styles.transferLabelOff,
          ]}
        >
          Transférer
        </Text>
      </TouchableOpacity>
      <Text style={styles.sectionTitle}>Historique</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
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
          <Text style={styles.empty}>Aucune transaction.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.txRow}>
            <View style={styles.txMain}>
              <Text style={styles.txLabel}>{item.label}</Text>
              {item.date ? (
                <Text style={styles.txDate}>{item.date}</Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.txAmount,
                item.amount < 0 ? styles.txNeg : styles.txPos,
              ]}
            >
              {item.amount < 0 ? "−" : "+"}$
              {Math.abs(item.amount).toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
              })}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingTop: 48 },
  screenTitle: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  loader: { marginBottom: 12 },
  balanceCard: {
    marginHorizontal: 20,
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  balanceLabel: {
    color: "#1a1508",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  balanceValue: {
    color: "#1a1508",
    fontSize: 32,
    fontWeight: "800",
  },
  transferBtn: {
    marginHorizontal: 20,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  transferOff: {
    backgroundColor: "#3a3a3a",
    opacity: 0.7,
  },
  transferLabel: { color: TEXT, fontWeight: "700", fontSize: 16 },
  transferLabelOff: { color: "#8a8580" },
  sectionTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: { color: "#8a8580", marginTop: 12 },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  txMain: { flex: 1, marginRight: 12 },
  txLabel: { color: TEXT, fontSize: 15, fontWeight: "600" },
  txDate: { color: "#8a8580", fontSize: 12, marginTop: 4 },
  txAmount: { fontSize: 15, fontWeight: "700" },
  txPos: { color: "#7dcea0" },
  txNeg: { color: "#ec7063" },
});
