import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Colors, Radius } from "../../constants/theme";
import { Button } from "../ui/Button";

/** Área de 600×240 (mesma do servidor, lib/tenant.ts). O traço vira só números: "M x y L x y ...". */
const W = 600;
const H = 240;

export function SignaturePad({ onChange }: { onChange: (path: string | null) => void }) {
  const [path, setPath] = useState("");
  const size = useRef({ w: 1, h: 1 });
  const current = useRef("");

  const point = (x: number, y: number) => {
    const px = Math.max(0, Math.min(W, (x / size.current.w) * W));
    const py = Math.max(0, Math.min(H, (y / size.current.h) * H));
    return `${px.toFixed(1)} ${py.toFixed(1)}`;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current += `${current.current ? " " : ""}M${point(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
        setPath(current.current);
      },
      onPanResponderMove: (e) => {
        current.current += ` L${point(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
        setPath(current.current);
      },
      onPanResponderRelease: () => onChange(current.current.length > 40 ? current.current : null),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const clear = () => {
    current.current = "";
    setPath("");
    onChange(null);
  };

  return (
    <View style={{ gap: 8 }}>
      <View
        style={styles.pad}
        onLayout={(e) => (size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel="Área de assinatura: desenhe sua assinatura com o dedo"
        {...responder.panHandlers}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
          <Path d={path || "M0 0"} stroke="#111" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        {!path && <Text style={styles.placeholder}>Assine aqui com o dedo</Text>}
      </View>
      <Button label="Limpar assinatura" variant="ghost" size="sm" onPress={clear} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { width: "100%", aspectRatio: W / H, backgroundColor: "#FFFFFF", borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong, overflow: "hidden" },
  placeholder: { position: "absolute", alignSelf: "center", top: "42%", color: "#9CA3AF", fontSize: 15 },
});
