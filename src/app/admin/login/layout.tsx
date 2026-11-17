import type { Metadata } from "next";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = { title: { absolute: `Entrar | ${PLATFORM.name}` } };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
