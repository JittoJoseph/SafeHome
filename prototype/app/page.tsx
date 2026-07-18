"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { FloorPlanViewer, Poi } from "./FloorPlanViewer";

type Property = { id: string; name: string; owner: string; address: string; image: string; pois: Poi[] };
type Incident = { id: string; propertyId: string; pois: Poi[]; created: string };
type Role = "home" | "owner" | "operator" | "responder";

const samples: Property[] = [
  { id: "willow", name: "Willow House", owner: "Mira Patel", address: "18 Cedar Grove, Brookfield", image: "/sample-floor-plan.png", pois: [] },
  { id: "cedar", name: "Cedar Residence", owner: "Arun Mehta", address: "42 Meadow Lane, Brookfield", image: "/floor-plan-4.png", pois: [] },
];

function Header({ role, setRole }: { role: Role; setRole: (role: Role) => void }) {
  return <header>
    <button className="brand" onClick={() => setRole("home")}>SAFEHOME <span>prototype</span></button>
    <nav>{(["owner", "operator", "responder"] as Role[]).map((item) => <button key={item} className={role === item ? "current" : ""} onClick={() => setRole(item)}>{item}</button>)}</nav>
    <div className="status"><i /> Local demo</div>
  </header>;
}

export default function Page() {
  const [role, setRole] = useState<Role>("home");
  const [properties, setProperties] = useState<Property[]>(samples);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [open, setOpen] = useState<string>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("safehome-v4");
    if (!saved) return;
    const data = JSON.parse(saved) as { properties: Property[]; incidents: Incident[] };
    setProperties([...data.properties, ...samples.filter((sample) => !data.properties.some((property) => property.id === sample.id))]);
    setIncidents(data.incidents);
  }, []);
  useEffect(() => localStorage.setItem("safehome-v4", JSON.stringify({ properties, incidents })), [properties, incidents]);

  const property = properties.find((item) => item.id === open);
  const incident = incidents.find((item) => item.propertyId === open);
  const pois = property ? [...property.pois, ...(incident?.pois ?? [])] : [];
  const results = useMemo(() => properties.filter((item) => `${item.name}${item.owner}${item.address}`.toLowerCase().includes(query.toLowerCase())), [query, properties]);

  const addProperty = () => {
    const next: Property = { id: crypto.randomUUID(), name: "New residence", owner: "Mira Patel", address: "Address pending", image: "/sample-floor-plan.png", pois: [] };
    setProperties((items) => [...items, next]);
    setOpen(next.id);
  };
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !property) return;
    const reader = new FileReader();
    reader.onload = () => setProperties((items) => items.map((item) => item.id === property.id ? { ...item, image: String(reader.result) } : item));
    reader.readAsDataURL(file);
  };
  const createIncident = () => property && !incident && setIncidents((items) => [{ id: crypto.randomUUID(), propertyId: property.id, created: "Live now", pois: [] }, ...items]);
  const addPoi = (kind: Poi["kind"]) => {
    if (!property) return;
    const poi: Poi = { id: crypto.randomUUID(), kind, type: kind === "owner" ? "Electrical panel" : "Fire origin", label: "Position marker", x: 0, y: 0.15, z: 0 };
    if (kind === "owner") setProperties((items) => items.map((item) => item.id === property.id ? { ...item, pois: [...item.pois, poi] } : item));
    else setIncidents((items) => items.map((item) => item.propertyId === property.id ? { ...item, pois: [...item.pois, poi] } : item));
  };
  const move = (id: string, position: Pick<Poi, "x" | "y" | "z">) => {
    setProperties((items) => items.map((item) => ({ ...item, pois: item.pois.map((poi) => poi.id === id ? { ...poi, ...position } : poi) })));
    setIncidents((items) => items.map((item) => ({ ...item, pois: item.pois.map((poi) => poi.id === id ? { ...poi, ...position } : poi) })));
  };
  const leaveProperty = () => { setOpen(undefined); setQuery(""); };

  if (role === "home") return <main className="welcome">
    <div className="welcome-copy"><p className="eyebrow">SAFEHOME / LOCAL PROTOTYPE</p><h1>Information that<br /><em>arrives before you do.</em></h1><p>Explore the property intelligence workflow as a homeowner, operator, or first responder.</p></div>
    <div className="role-cards">{([ ["owner", "Homeowner", "Maintain floor plans and safety markers."], ["operator", "Emergency operator", "Locate a property and coordinate an incident."], ["responder", "First responder", "Review active information at a glance."] ] as const).map(([nextRole, title, description]) => <button key={nextRole} onClick={() => setRole(nextRole)}><span>Open workspace</span><b>{title}</b><small>{description}</small><i>→</i></button>)}</div>
  </main>;

  if (property) return <main className="shell"><Header role={role} setRole={(nextRole) => { setRole(nextRole); leaveProperty(); }} />
    <div className="property-bar"><button onClick={leaveProperty}>← Workspace</button><div><strong>{property.name}</strong><span>{property.address}</span></div><span className={incident ? "live" : "quiet"}>{incident ? "● Incident live" : "Property record"}</span></div>
    <section className="property-layout"><div className="model-pane"><div className="model-title"><div><p className="eyebrow">{incident ? "Situation monitoring" : "Property model"}</p><h1>{property.address}</h1><p>Floor plan processed locally. Select a marker to position it with the axis controls.</p></div>{role === "operator" && !incident && <button className="primary" onClick={createIncident}>Create incident</button>}</div><FloorPlanViewer image={property.image} pois={pois} editable={role !== "responder"} onMove={move} /></div>
      <aside className="inspector"><section><p className="eyebrow">Points of interest</p><h2>Marker register</h2>{pois.length ? pois.map((poi) => <div className="poi" key={poi.id}><i className={poi.kind} /><div><b>{poi.type}</b><span>{poi.kind === "owner" ? "Homeowner" : "Incident"} · {poi.label}</span></div></div>) : <p className="empty">No markers yet. Add only information that will help on arrival.</p>}{role === "owner" && <button className="secondary" onClick={() => addPoi("owner")}>Add homeowner POI</button>}{role === "operator" && incident && <button className="secondary" onClick={() => addPoi("operator")}>Add incident POI</button>}</section>{role === "owner" && <section><p className="eyebrow">Floor plan</p><h2>Source image</h2><p className="empty">Upload a new plan to regenerate this local 3D model.</p><label className="upload">Choose floor plan<input type="file" accept="image/*" onChange={upload} /></label></section>}{role === "operator" && incident && <section><p className="eyebrow">Placement</p><h2>Axis controls</h2><p className="empty">Select a marker. Drag X horizontally, Z vertically, or Y to raise and lower it.</p></section>}</aside>
    </section>
  </main>;

  return <main className="shell"><Header role={role} setRole={setRole} /><section className="dashboard">
    {role === "owner" && <><div className="dash-head"><div><p className="eyebrow">Homeowner workspace</p><h1>Your properties</h1><p>Manage current floor plans and permanent safety information.</p></div><button className="primary" onClick={addProperty}>New property</button></div><div className="property-grid">{properties.map((item) => <button onClick={() => setOpen(item.id)} key={item.id}><span>Property record</span><b>{item.name}</b><small>{item.address}</small><i>{item.pois.length} markers <em>→</em></i></button>)}</div></>}
    {role === "operator" && <div className="operator"><p className="eyebrow">Emergency operator</p><h1>Find a property</h1><p>Search an owner, address, or property name before creating an incident.</p><div className="big-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search owner or address" /><span>⌕</span></div>{query && <div className="suggestions">{results.map((item) => <button onClick={() => setOpen(item.id)} key={item.id}><div><b>{item.address}</b><span>{item.owner} · {item.name}</span></div><i>Open →</i></button>)}{!results.length && <p className="empty">No matching property records.</p>}</div>}</div>}
    {role === "responder" && <><div className="dash-head"><div><p className="eyebrow">First responder</p><h1>Active incidents</h1><p>Read-only property models and markers created for the current situation.</p></div></div>{incidents.length ? <div className="property-grid">{incidents.map((item) => { const linked = properties.find((property) => property.id === item.propertyId); if (!linked) return null; return <button onClick={() => setOpen(linked.id)} key={item.id}><span className="red">● Live incident</span><b>{linked.address}</b><small>{linked.name} · {linked.owner}</small><i>{linked.pois.length + item.pois.length} markers <em>→</em></i></button>; })}</div> : <div className="empty-state"><p className="eyebrow">Standing by</p><h2>No active incidents</h2><p>Operator-created incidents appear here automatically.</p></div>}</>}
  </section></main>;
}
