import Constants from "expo-constants";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "../../hooks/useSession";

const BG = "#080808";
const TEXT = "#F5F0E8";
const ACCENT = "#C0392B";

export default function ProfilScreen() {
  const { member, isLoading, signOut } = useSession();
  const version =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    "—";

  const onSignOut = async () => {
    Alert.alert("Déconnexion", "Quitter la session ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: () => void signOut(),
      },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profil</Text>
      {isLoading ? (
        <Text style={styles.muted}>Chargement…</Text>
      ) : member ? (
        <View style={styles.card}>
          <Row label="Nom" value={member.display_name} />
          <Row label="Courriel" value={member.email || "—"} />
          <View style={styles.row}>
            <Text style={styles.label}>Type</Text>
            {member.member_type ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{member.member_type}</Text>
              </View>
            ) : (
              <Text style={styles.value}>—</Text>
            )}
          </View>
          <Row label="Numéro membre" value={member.numero_membre || "—"} />
          <Row
            label="Multiplicateur"
            value={String(member.multiplier ?? "—")}
          />
        </View>
      ) : (
        <Text style={styles.muted}>Aucune session membre chargée.</Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.signOut,
          pressed && { opacity: 0.9 },
        ]}
        onPress={onSignOut}
      >
        <Text style={styles.signOutText}>Se déconnecter</Text>
      </Pressable>

      <Text style={styles.version}>Version {version}</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    color: TEXT,
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 20,
  },
  muted: { color: "#8a8580", marginBottom: 16 },
  card: {
    backgroundColor: "#121212",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 24,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    gap: 12,
  },
  label: { color: "#a39e96", fontSize: 14, flexShrink: 0 },
  value: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  badge: {
    backgroundColor: "#2a1512",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  badgeText: { color: ACCENT, fontWeight: "700", fontSize: 12 },
  signOut: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  signOutText: { color: TEXT, fontWeight: "700", fontSize: 16 },
  version: { color: "#6a6560", fontSize: 13, textAlign: "center" },
});
