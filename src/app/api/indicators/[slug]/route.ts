import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const indicator=await prisma.indicator.findUnique({where:{slug},include:{category:true,source:true,observations:{orderBy:[{region:"asc"},{period:"asc"}]}}});
 if(!indicator)return NextResponse.json({error:"Indicador não encontrado"},{status:404});
 return NextResponse.json({data:indicator});
}