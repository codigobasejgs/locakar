import { Tabs } from "expo-router";
import { Car, CreditCard, Key, User } from "lucide-react-native";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom > 0 ? insets.bottom : (Platform.OS === "android" ? 10 : 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: bottomPad,
          height: 60 + bottomPad,
        },
        tabBarActiveTintColor: Colors.brandSoft,
        tabBarInactiveTintColor: Colors.textSubtle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="inicio"
        options={{
          title: "Início",
          tabBarIcon: ({ color, size }) => <Car color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="locacao"
        options={{
          title: "Locação",
          tabBarIcon: ({ color, size }) => <Key color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pagamentos"
        options={{
          title: "Pagamentos",
          tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
