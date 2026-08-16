import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
const sans=Geist({variable:"--font-sans",subsets:["latin"]}); const mono=Geist_Mono({variable:"--font-mono",subsets:["latin"]});
export async function generateMetadata():Promise<Metadata>{const h=await headers();const host=h.get("host")||"localhost:3000";const base=`${host.includes("localhost")?"http":"https"}://${host}`;return {metadataBase:new URL(base),title:"NexusVerify — Blockchain Transcript Verification",description:"Privacy-first academic credential issuance and blockchain verification.",icons:{icon:"/favicon.svg"},openGraph:{title:"NexusVerify",description:"Academic credentials. Mathematically secured.",images:[{url:"/og.png",width:1664,height:920,alt:"NexusVerify academic credential verification"}]},twitter:{card:"summary_large_image",title:"NexusVerify",description:"Academic credentials. Mathematically secured.",images:["/og.png"]}}}
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>}
