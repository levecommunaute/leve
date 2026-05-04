import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { SessionProvider } from "../../hooks/useSession";

const BG = "#080808";
const TINT = "#C0392B";

export default function TabsLayout() {
  return (
    <SessionProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: BG,
            borderTopColor: "#1a1a1a",
          },
          tabBarActiveTintColor: TINT,
          tabBarInactiveTintColor: "#8a8580",
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Accueil",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="code"
          options={{
            title: "Code",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="keypad" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="classement"
          options={{
            title: "Classement",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="trophy" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="banque"
          options={{
            title: "Banque",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profil"
          options={{
            title: "Profil",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </SessionProvider>
  );
}
