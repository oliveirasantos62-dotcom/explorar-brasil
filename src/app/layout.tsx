import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Observatório | Dados econômicos e sociais",
  description: "Indicadores públicos organizados, contextualizados e comparáveis."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}