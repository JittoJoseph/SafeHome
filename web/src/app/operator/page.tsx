import Link from "next/link";
import { createSituation } from "@/app/actions";
import { apiJson, currentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";

export default async function OperatorDashboard({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
	const user = await currentUser(); if (!user || user.role !== "operator") redirect("/");
	const { q } = await searchParams;
	const { properties } = q ? await apiJson<{ properties: Array<{ id: string; address: string; owner_name: string }> }>(`/search?q=${encodeURIComponent(q)}`) : { properties: [] };
	const { situations } = await apiJson<{ situations: Array<{ id: string; address: string; owner_name: string; created_at: string }> }>("/situations");
	return <Shell user={user}><section className="dashboard-heading"><div><p className="eyebrow">Emergency operator</p><h1>Find a property</h1></div></section><form className="search"><input name="q" defaultValue={q} placeholder="Owner name or property address" autoComplete="off" /><button>Search</button></form>{q && <section className="cards">{properties.map((property) => <article className="card" key={property.id}><strong>{property.address}</strong><span>Owner: {property.owner_name}</span><form action={createSituation}><input type="hidden" name="propertyId" value={property.id} /><button>Create situation</button></form></article>)}{properties.length === 0 && <p className="empty">No matching properties.</p>}</section>}<section className="section"><h2>Active situations</h2><div className="cards">{situations.map((situation) => <Link className="card" href={`/operator/situations/${situation.id}`} key={situation.id}><strong>{situation.address}</strong><span>{situation.owner_name}</span></Link>)}</div></section></Shell>;
}
