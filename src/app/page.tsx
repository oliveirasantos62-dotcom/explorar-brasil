import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ChartNoAxesCombined, Database, Globe2, Search } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function Home() {
  const [indicators, count, sources, categories] = await Promise.all([
    prisma.indicator.findMany({ include:{category:true,source:true,observations:{orderBy:[{period:"desc"},{region:"asc"}],take:1}} , orderBy:{name:"asc"} }),
    prisma.indicator.count(), prisma.source.count(), prisma.category.count()
  ]);
  return <main className="shell">
    <header className="topbar"><Link href="/" className="brand"><span className="brandmark"><ChartNoAxesCombined size={22}/></span> OBSERVATÓRIO</Link><nav className="nav"><Link href="/">Visão geral</Link><Link href="/indicadores">Indicadores</Link><Link href="/explorar-brasil">Explorar Brasil</Link><a href="#sobre">Sobre o projeto</a></nav></header>
    <section className="hero"><div><div className="eyebrow">Dados públicos, contexto e transparência</div><h1>Entenda os números<br/>que movem a sociedade.</h1><p>Explore indicadores econômicos e sociais em um só lugar. Consulte séries históricas, conheça as fontes e compare informações com contexto.</p></div><div className="updated">MVP · dados públicos oficiais</div></section>
    <div className="notice"><b>Transparência:</b> os indicadores são carregados das fontes oficiais por uma rotina de ingestão. Confira a fonte, o período e a última consulta em cada página de detalhe. Se o catálogo estiver vazio, execute <code>npm run ingest</code> após configurar o banco.</div>
    <section className="stats">
      <div className="stat"><span>Indicadores cadastrados</span><strong>{count}</strong><small>Catálogo inicial</small></div>
      <div className="stat"><span>Fontes institucionais</span><strong>{sources}</strong><small>IBGE, BCB e IPEA</small></div>
      <div className="stat"><span>Temas</span><strong>{categories}</strong><small>Classificação temática</small></div>
      <div className="stat"><span>Países cobertos</span><strong>1</strong><small>Brasil · demonstração</small></div>
    </section>
    <div className="sectionhead"><h2>Indicadores em destaque</h2><Link href="/indicadores">Explorar catálogo →</Link></div>
    <Link href="/explorar-brasil" className="map-promo"><span className="map-promo-icon"><Globe2 size={23}/></span><span><b>Explore os dados pelo mapa do Brasil</b><small>Compare estados, consulte rankings e acompanhe a evolução dos indicadores territoriais.</small></span><strong>Explorar mapa →</strong></Link>
    <section className="cards">{indicators.map(i=><Link href={`/indicadores/${i.slug}`} className="card" key={i.id}><span className="tag">{i.category.name}</span><h3>{i.name}</h3><p>{i.description}</p><div className="metric">{i.observations[0]?.value ?? "—"} <small>{i.unit}</small></div><small className="muted">Último registro: {i.observations[0]?.period ?? "Sem dados"} · {i.observations[0]?.region ?? "Sem território"}</small></Link>)}</section>
    <section id="sobre" className="sectionhead"><h2>Um dado precisa de contexto.</h2></section>
    <div className="cards"><div className="card"><Database color="#2457d6"/><h3>Fontes identificadas</h3><p>Instituição, endereço da fonte e metadados acompanham cada indicador.</p></div><div className="card"><Globe2 color="#138a67"/><h3>Comparação responsável</h3><p>Região, período, unidade e metodologia devem ser considerados juntos.</p></div><div className="card"><Search color="#8b5cf6"/><h3>Exploração simples</h3><p>Catálogo pesquisável para encontrar informações sem navegar por várias bases.</p></div></div>
    <footer className="footer"><span>Observatório de Dados Econômicos e Sociais · MVP</span><span>Dados importados · consulte metodologia e fontes</span></footer>
  </main>;
}