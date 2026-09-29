import { View } from "react-native";
import { useTheme } from "../context/ThemeProvider";

/** Rota inicial: o Gate em _layout.tsx decide para onde ir (login, vincular ou início). */
export default function Index() {
  const { colors: Colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
