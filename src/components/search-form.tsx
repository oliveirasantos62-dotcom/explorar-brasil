"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
export function SearchForm({categories,initialQ,initialCategory}:{categories:{slug:string;name:string}[];initialQ:string;initialCategory:string}) {
 const [q,setQ]=useState(initialQ); const [category,setCategory]=useState(initialCategory); const router=useRouter();
 function submit(e:React.FormEvent){e.preventDefault();const p=new URLSearchParams();if(q)p.set("q",q);if(category)p.set("category",category);router.push(`/indicadores?${p.toString()}`)}
 return <form className="filters" onSubmit={submit}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar indicador..."/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todos os temas</option>{categories.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select><button style={{border:0,borderRadius:10,background:"#2457d6",color:"white",padding:"0 20px",fontWeight:700,cursor:"pointer"}}>Filtrar</button></form>
}