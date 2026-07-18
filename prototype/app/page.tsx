"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { FloorPlanViewer, Poi } from "./FloorPlanViewer";

type Property = { id: string; name: string; owner: string; address: string; image: string; pois: Poi[] };
type Incident = { id: string; propertyId: string; pois: Poi[]; created: string };
type Role = "home" | "owner" | "operator" | "responder";
type Draft = { name: string; owner: string; address: string; image?: string };

const POI_LIBRARY: Record<Poi["kind"], string[]> = {
  owner: ["Electrical panel", "Gas shutoff", "Water shutoff", "Smoke detector", "Fire extinguisher", "Hazard storage"],
  operator: ["Fire origin", "Trapped occupant", "Blocked exit", "Structural hazard", "Utility access"],
};

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
  const [draft, setDraft] = useState<Draft>();
  const [step, setStep] = useState(1);
  const [selectedPoi, setSelectedPoi] = useState<string>();
  const [placingType, setPlacingType] = useState<string>();

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

  // Reset the editing session whenever the open property changes.
  useEffect(() => { setSelectedPoi(undefined); setPlacingType(undefined); }, [open]);
  // Escape cancels placement mode.
  useEffect(() => {
    if (!placingType) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPlacingType(undefined); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placingType]);

  const editable = role !== "responder";
  const activeKind: Poi["kind"] = role === "owner" ? "owner" : "operator";
  const canPlace = editable && (role === "owner" || (role === "operator" && !!incident));

  const startOnboarding = () => { setDraft({ name: "", owner: "", address: "" }); setStep(1); };
  const draftUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((current) => current && { ...current, image: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const finishOnboarding = () => {
    if (!draft?.image || !draft.address.trim()) return;
    const next: Property = { id: crypto.randomUUID(), name: draft.name.trim() || "Untitled property", owner: draft.owner.trim() || "Unassigned", address: draft.address.trim(), image: draft.image, pois: [] };
    setProperties((items) => [...items, next]);
    setDraft(undefined);
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

  const placePoi = (point: { x: number; y: number; z: number }) => {
    if (!property || !placingType) return;
    const poi: Poi = { id: crypto.randomUUID(), kind: activeKind, type: placingType, label: "Placed in viewport", ...point };
    if (activeKind === "owner") setProperties((items) => items.map((item) => item.id === property.id ? { ...item, pois: [...item.pois, poi] } : item));
    else setIncidents((items) => items.map((item) => item.propertyId === property.id ? { ...item, pois: [...item.pois, poi] } : item));
    setSelectedPoi(poi.id);
    setPlacingType(undefined);
  };
  const move = (id: string, position: Pick<Poi, "x" | "y" | "z">) => {
    setProperties((items) => items.map((item) => ({ ...item, pois: item.pois.map((poi) => poi.id === id ? { ...poi, ...position } : poi) })));
    setIncidents((items) => items.map((item) => ({ ...item, pois: item.pois.map((poi) => poi.id === id ? { ...poi, ...position } : poi) })));
  };
  const removePoi = (id: string) => {
    setProperties((items) => items.map((item) => ({ ...item, pois: item.pois.filter((poi) => poi.id !== id) })));
    setIncidents((items) => items.map((item) => ({ ...item, pois: item.pois.filter((poi) => poi.id !== id) })));
    setSelectedPoi((current) => current === id ? undefined : current);
  };

  const leaveProperty = () => { setOpen(undefined); setQuery(""); };
  const selected = pois.find((poi) => poi.id === selectedPoi);

  if (role === "home") return <main className="welcome">
    <div className="welcome-copy"><p className="eyebrow">SAFEHOME / LOCAL PROTOTYPE</p><h1>Information that<br /><em>arrives before you do.</em></h1><p>Explore the property intelligence workflow as a homeowner, operator, or first responder.</p></div>
    <div className="role-cards">{([ ["owner", "Homeowner", "Maintain floor plans and safety markers."], ["operator", "Emergency operator", "Locate a property and coordinate an incident."], ["responder", "First responder", "Review active information at a glance."] ] as const).map(([nextRole, title, description]) => <button key={nextRole} onClick={() => setRole(nextRole)}><span>Open workspace</span><b>{title}</b><small>{description}</small><i>→</i></button>)}</div>
  </main>;

  if (role === "owner" && draft) {
    const detailsReady = draft.address.trim().length > 0;
    return <main className="shell"><Header role={role} setRole={(nextRole) => { setDraft(undefined); setRole(nextRole); }} />
      <div className="property-bar"><button onClick={() => setDraft(undefined)}>← Workspace</button><div><strong>Add a property</strong><span>Set up a new floor plan record</span></div></div>
      <section className="onboard">
        <ol className="steps"><li className={step >= 1 ? "on" : ""}><b>1</b> Property details</li><li className={step >= 2 ? "on" : ""}><b>2</b> Floor plan</li></ol>
        {step === 1 && <div className="onboard-card">
          <p className="eyebrow">Step 1 of 2</p><h1>Where is the property?</h1><p className="lede">These details help operators locate the residence during an incident.</p>
          <label className="field"><span>Property name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Willow House" /></label>
          <label className="field"><span>Owner</span><input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Full name" /></label>
          <label className="field"><span>Address <em>*</em></span><input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Street, suburb, city" /></label>
          <div className="onboard-actions"><span /><button className="primary" disabled={!detailsReady} onClick={() => setStep(2)}>Continue →</button></div>
        </div>}
        {step === 2 && <div className="onboard-card">
          <p className="eyebrow">Step 2 of 2</p><h1>Upload the floor plan</h1><p className="lede">A high-contrast plan works best — we build the 3D model locally in your browser.</p>
          <label className={`dropzone${draft.image ? " filled" : ""}`}>
            {draft.image ? <img src={draft.image} alt="Floor plan preview" /> : <div className="dropzone-empty"><b>Choose an image</b><span>PNG or JPG floor plan</span></div>}
            <input type="file" accept="image/*" onChange={draftUpload} />
          </label>
          <div className="onboard-actions"><button className="ghost" onClick={() => setStep(1)}>← Back</button><button className="primary" disabled={!draft.image} onClick={finishOnboarding}>Create property</button></div>
        </div>}
      </section>
    </main>;
  }

  if (property) return <main className="shell"><Header role={role} setRole={(nextRole) => { setRole(nextRole); leaveProperty(); }} />
    <div className="property-bar"><button onClick={leaveProperty}>← Workspace</button><div><strong>{property.name}</strong><span>{property.address}</span></div><span className={incident ? "live" : "quiet"}>{incident ? "● Incident live" : "Property record"}</span></div>
    <section className="property-layout"><div className="model-pane"><div className="model-title"><div><p className="eyebrow">{incident ? "Situation monitoring" : "Property model"}</p><h1>{property.address}</h1><p>Floor plan processed locally. Pick a marker type, then click the model to place it — drag the gizmo to fine-tune.</p></div>{role === "operator" && !incident && <button className="primary" onClick={createIncident}>Create incident</button>}</div>
      <FloorPlanViewer image={property.image} pois={pois} editable={editable} placing={!!placingType} selectedId={selectedPoi} onSelect={setSelectedPoi} onPlace={placePoi} onMove={move} /></div>
      <aside className="inspector">
        {canPlace && <section>
          <p className="eyebrow">Add point of interest</p><h2>Marker palette</h2>
          {placingType
            ? <div className="placing-banner"><div><b>Placing “{placingType}”</b><span>Click the model to drop it, or press Esc.</span></div><button className="ghost" onClick={() => setPlacingType(undefined)}>Cancel</button></div>
            : <p className="empty">Choose a type below, then click on the 3D model to place it.</p>}
          <div className="poi-palette">{POI_LIBRARY[activeKind].map((type) => <button key={type} className={placingType === type ? "active" : ""} onClick={() => { setSelectedPoi(undefined); setPlacingType(type); }}><i className={activeKind} />{type}</button>)}</div>
        </section>}
        {selected && editable && <section className="selected-card">
          <p className="eyebrow">Selected marker</p><h2>{selected.type}</h2>
          <p className="empty">Drag the coloured arrows in the viewport to move it along X, Y, and Z. No typing required.</p>
          <div className="selected-actions"><button className="ghost" onClick={() => setSelectedPoi(undefined)}>Deselect</button><button className="danger-btn" onClick={() => removePoi(selected.id)}>Remove</button></div>
        </section>}
        <section>
          <p className="eyebrow">Points of interest</p><h2>Marker register</h2>
          {pois.length ? pois.map((poi) => <button className={`poi${selectedPoi === poi.id ? " chosen" : ""}`} key={poi.id} onClick={() => { setPlacingType(undefined); setSelectedPoi(poi.id); }}><i className={poi.kind} /><div><b>{poi.type}</b><span>{poi.kind === "owner" ? "Homeowner" : "Incident"} · {poi.label}</span></div></button>) : <p className="empty">No markers yet. Add only information that will help on arrival.</p>}
        </section>
        {role === "owner" && <section><p className="eyebrow">Floor plan</p><h2>Source image</h2><p className="empty">Upload a new plan to regenerate this local 3D model.</p><label className="upload">Replace floor plan<input type="file" accept="image/*" onChange={upload} /></label></section>}
      </aside>
    </section>
  </main>;

  return <main className="shell"><Header role={role} setRole={setRole} /><section className="dashboard">
    {role === "owner" && <><div className="dash-head"><div><p className="eyebrow">Homeowner workspace</p><h1>Your properties</h1><p>Manage current floor plans and permanent safety information.</p></div><button className="primary" onClick={startOnboarding}>New property</button></div><div className="property-grid">{properties.map((item) => <button onClick={() => setOpen(item.id)} key={item.id}><span>Property record</span><b>{item.name}</b><small>{item.address}</small><i>{item.pois.length} markers <em>→</em></i></button>)}</div></>}
    {role === "operator" && <div className="operator"><p className="eyebrow">Emergency operator</p><h1>Find a property</h1><p>Search an owner, address, or property name before creating an incident.</p><div className="big-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search owner or address" /><span>⌕</span></div>{query && <div className="suggestions">{results.map((item) => <button onClick={() => setOpen(item.id)} key={item.id}><div><b>{item.address}</b><span>{item.owner} · {item.name}</span></div><i>Open →</i></button>)}{!results.length && <p className="empty">No matching property records.</p>}</div>}</div>}
    {role === "responder" && <><div className="dash-head"><div><p className="eyebrow">First responder</p><h1>Active incidents</h1><p>Read-only property models and markers created for the current situation.</p></div></div>{incidents.length ? <div className="property-grid">{incidents.map((item) => { const linked = properties.find((property) => property.id === item.propertyId); if (!linked) return null; return <button onClick={() => setOpen(linked.id)} key={item.id}><span className="red">● Live incident</span><b>{linked.address}</b><small>{linked.name} · {linked.owner}</small><i>{linked.pois.length + item.pois.length} markers <em>→</em></i></button>; })}</div> : <div className="empty-state"><p className="eyebrow">Standing by</p><h2>No active incidents</h2><p>Operator-created incidents appear here automatically.</p></div>}</>}
  </section></main>;
}
