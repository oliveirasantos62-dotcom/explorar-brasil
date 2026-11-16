import Link from "next/link";
import { BrazilExplorer } from "@/components/brazil-explorer";
import { ChartNoAxesCombined } from "lucide-react";

export const metadata = {
  title: "Explorar Brasil | Observatório",
  description: "Explore indicadores econômicos e sociais por estado, compare unidades federativas e acompanhe séries históricas.",
};

export default function ExploreBrazilPage() {
  return <main className="shell">
    <header className="topbar">
      <Link href="/" className="brand"><span className="brandmark"><ChartNoAxesCombined size={22}/></span> OBSERVATÓRIO</Link>
      <nav className="nav"><Link href="/">Visão geral</Link><Link href="/indicadores">Indicadores</Link><Link href="/explorar-brasil" aria-current="page">Explorar Brasil</Link></nav>
    </header>
    <BrazilExplorer />
    <footer className="footer"><span>Observatório de Dados Econômicos e Sociais</span><span>Malha territorial: IBGE · Dados estatísticos: fontes identificadas em cada indicador</span></footer>
  </main>;
}
