import Link from "next/link";
import { createProperty } from "@/app/actions";
import { apiJson, currentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";

export default async function OwnerDashboard() {
	const user = await currentUser(); if (!user || user.role !== "owner") redirect("/");
	const { properties } = await apiJson<{ properties: Array<{ id: string; address: string; has_floor_plan: boolean }> }>("/properties");
	return <Shell user={user}><section className="dashboard-heading"><div><p className="eyebrow">Homeowner dashboard</p><h1>Your properties</h1></div><form action={createProperty} className="inline-form"><input name="address" placeholder="Property address" required /><button>Add property</button></form></section><section className="cards">{properties.map((property) => <Link className="card" href={`/owner/properties/${property.id}`} key={property.id}><strong>{property.address}</strong><span>{property.has_floor_plan ? "Floor plan ready" : "Floor plan needed"}</span></Link>)}{properties.length === 0 && <p className="empty">Add your first property to upload its floor plan and mark permanent points of interest.</p>}</section></Shell>;
}
