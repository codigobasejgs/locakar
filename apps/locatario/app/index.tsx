import { View } from "react-native";
import { Colors } from "../constants/theme";

/** Rota inicial: o Gate em _layout.tsx decide para onde ir (login, vincular ou início). */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
