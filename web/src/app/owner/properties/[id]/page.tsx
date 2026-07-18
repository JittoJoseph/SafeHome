import { createPoi, uploadFloorPlan } from "@/app/actions";
import { apiJson, currentUser } from "@/lib/api";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";
import { PropertyViewer } from "@/app/components/property-viewer";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params; const user = await currentUser(); if (!user || user.role !== "owner") redirect("/");
	const { property, pois } = await apiJson<{ property: { address: string; floor_plan_key: string | null }; pois: Array<{ id: string; type: string; label: string; position_x: number; position_y: number; position_z: number; creator_role: string }> }>(`/properties/${id}`);
	return <Shell user={user}><section className="dashboard-heading"><div><p className="eyebrow">Property</p><h1>{property.address}</h1></div></section>{property.floor_plan_key ? <><PropertyViewer propertyId={id} pois={pois} /><section className="poi-list"><h2>Permanent points of interest</h2>{pois.filter((poi) => poi.creator_role === "owner").map((poi) => <p key={poi.id}>{poi.type}: {poi.label}</p>)}</section><form action={createPoi.bind(null, id, undefined)} className="poi-form"><select name="type"><option>Electrical Panel</option><option>Gas Valve</option><option>Gas Cylinder</option></select><input name="label" placeholder="Label" required /><input name="x" type="number" step="0.1" placeholder="X" required /><input name="y" type="number" step="0.1" defaultValue="0.2" required /><input name="z" type="number" step="0.1" placeholder="Z" required /><button>Add POI</button></form></> : <p className="empty">Upload a clean floor plan image to generate the 3D view.</p>}<form action={uploadFloorPlan.bind(null, id)} className="upload"><label>Replace floor plan<input name="floorPlan" type="file" accept="image/*" required /></label><button>Upload floor plan</button></form></Shell>;
}
