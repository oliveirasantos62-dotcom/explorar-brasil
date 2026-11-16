import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(req:NextRequest){
 const p=req.nextUrl.searchParams;const slug=p.get("indicator");const a=p.get("regionA")||"Brasil";const b=p.get("regionB");
 if(!slug||!b)return NextResponse.json({error:"Informe indicator e regionB."},{status:400});
 const indicator=await prisma.indicator.findUnique({where:{slug},include:{observations:{where:{region:{in:[a,b]}},orderBy:{period:"asc"}}}});
 if(!indicator)return NextResponse.json({error:"Indicador não encontrado."},{status:404});
 const byRegion=(region:string)=>indicator.observations.filter(o=>o.region===region).map(o=>({period:o.period,value:o.value}));
 return NextResponse.json({data:{indicator:indicator.name,unit:indicator.unit,regionA:{name:a,series:byRegion(a)},regionB:{name:b,series:byRegion(b)}}});
}