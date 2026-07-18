import Link from "next/link";
import { apiJson, currentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";

export default async function ResponderDashboard() {
	const user = await currentUser(); if (!user || user.role !== "responder") redirect("/");
	const { situations } = await apiJson<{ situations: Array<{ id: string; address: string; owner_name: string; created_at: string }> }>("/situations");
	return <Shell user={user}><section className="dashboard-heading"><div><p className="eyebrow">First responder</p><h1>Active situations</h1></div></section><section className="cards">{situations.map((situation) => <Link className="card" href={`/responder/situations/${situation.id}`} key={situation.id}><strong>{situation.address}</strong><span>Owner: {situation.owner_name}</span></Link>)}{situations.length === 0 && <p className="empty">There are no active situations.</p>}</section></Shell>;
}
