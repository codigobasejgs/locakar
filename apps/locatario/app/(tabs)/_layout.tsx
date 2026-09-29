import { Tabs } from "expo-router";
import { TenantTabBar } from "../../components/layout/TenantNavigation";
import { Colors } from "../../constants/theme";
import { useLayout } from "../../hooks/useLayout";

/** Abas do app: barra inferior no celular/tablet e barra lateral no desktop (mesmo componente). */
export default function TabLayout() {
  const { isDesktop } = useLayout();
  return (
    <Tabs
      tabBar={(props) => <TenantTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: isDesktop ? "left" : "bottom",
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: "Início" }} />
      <Tabs.Screen name="locacao" options={{ title: "Minha locação" }} />
      <Tabs.Screen name="pagamentos" options={{ title: "Pagamentos" }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil" }} />
    </Tabs>
  );
}
