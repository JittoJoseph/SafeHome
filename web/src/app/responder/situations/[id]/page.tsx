import { apiJson, currentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";
import { PropertyViewer } from "@/app/components/property-viewer";

export default async function ResponderSituation({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params; const user = await currentUser(); if (!user || user.role !== "responder") redirect("/");
	const { property, pois } = await apiJson<{ property: { id: string; address: string }; pois: Array<{ id: string; type: string; label: string; position_x: number; position_y: number; position_z: number; creator_role: string }> }>(`/situations/${id}`);
	return <Shell user={user}><section className="dashboard-heading"><div><p className="eyebrow">Situation view</p><h1>{property.address}</h1></div></section><PropertyViewer propertyId={property.id} pois={pois} /><section className="poi-list"><h2>Points of interest</h2>{pois.map((poi) => <p key={poi.id}>{poi.type}: {poi.label}</p>)}</section></Shell>;
}
