import { apiJson, currentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";
import { PropertyViewer } from "@/app/components/property-viewer";
import { createPoi } from "@/app/actions";

export default async function SituationPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params; const user = await currentUser(); if (!user || user.role !== "operator") redirect("/");
	const { situation, property, pois } = await apiJson<{ situation: { id: string }; property: { id: string; address: string }; pois: Array<{ id: string; type: string; label: string; position_x: number; position_y: number; position_z: number; creator_role: string }> }>(`/situations/${id}`);
	return <Shell user={user}><section className="dashboard-heading"><div><p className="eyebrow">Active situation</p><h1>{property.address}</h1></div></section><PropertyViewer propertyId={property.id} pois={pois} /><section className="poi-list"><h2>Points of interest</h2>{pois.map((poi) => <p key={poi.id}>{poi.type}: {poi.label}</p>)}</section><form action={createPoi.bind(null, property.id, situation.id)} className="poi-form"><select name="type"><option>Fire Origin</option><option>Trapped Victim</option></select><input name="label" placeholder="Label" required /><input name="x" type="number" step="0.1" placeholder="X" required /><input name="y" type="number" step="0.1" defaultValue="0.2" required /><input name="z" type="number" step="0.1" placeholder="Z" required /><button>Add incident POI</button></form></Shell>;
}
