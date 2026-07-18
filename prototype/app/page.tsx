"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { FloorPlanViewer, Poi } from "./FloorPlanViewer";

type Property = { id: string; name: string; owner: string; address: string; image: string; pois: Poi[] };
type Incident = { id: string; propertyId: string; pois: Poi[]; created: string };
type Role = "home" | "owner" | "operator" | "responder";
type Draft = { name: string; owner: string; address: string; image?: string };

const POI_LIBRARY: Record<Poi["kind"], string[]> = {
  owner: ["Electrical panel", "Gas valve", "Gas cylinder", "Water shutoff", "Smoke detector", "Fire extinguisher"],
  operator: ["Fire origin", "Trapped victim", "Blocked exit", "Structural hazard", "Utility access"],
};

const samples: Property[] = [
  { id: "willow", name: "Willow House", owner: "Mira Patel", address: "18 Cedar Grove, Brookfield", image: "/sample-floor-plan.png", pois: [] },
  { id: "cedar", name: "Cedar Residence", owner: "Arun Mehta", address: "42 Meadow Lane, Brookfield", image: "/floor-plan-4.png", pois: [] },
];

const ROLES: Role[] = ["owner", "operator", "responder"];

function TopBar({ role, setRole }: { role: Role; setRole: (role: Role) => void }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setRole("home")}>
        <span className="brand-mark">S</span>
        <span className="brand-name">SafeHome<small>Emergency Response</small></span>
      </button>
      <nav className="role-switch">
        {ROLES.map((item) => (
          <button key={item} className={role === item ? "on" : ""} onClick={() => setRole(item)}>{item}</button>
        ))}
      </nav>
      <div className="topbar-meta">
        <span className="status-chip"><i /> Local demo</span>
      </div>
    </header>
  );
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
  const [confirmAction, setConfirmAction] = useState<{ label: string; verb: string; run: () => void }>();

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
  const results = useMemo(
    () => properties.filter((item) => `${item.name}${item.owner}${item.address}`.toLowerCase().includes(query.toLowerCase())),
    [query, properties],
  );

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

  const resetSession = () => { setSelectedPoi(undefined); setPlacingType(undefined); setConfirmAction(undefined); };
  const openProperty = (id: string) => { resetSession(); setOpen(id); };
  const goRole = (next: Role) => { resetSession(); setRole(next); setOpen(undefined); setQuery(""); setDraft(undefined); };

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
    const next: Property = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || "Untitled property",
      owner: draft.owner.trim() || "Unassigned",
      address: draft.address.trim(),
      image: draft.image,
      pois: [],
    };
    setProperties((items) => [...items, next]);
    setDraft(undefined);
    openProperty(next.id);
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

  const leaveProperty = () => { resetSession(); setOpen(undefined); setQuery(""); };
  const selected = pois.find((poi) => poi.id === selectedPoi);

  const deleteProperty = (id: string) => {
    setProperties((items) => items.filter((item) => item.id !== id));
    setIncidents((items) => items.filter((item) => item.propertyId !== id));
    setOpen((current) => current === id ? undefined : current);
  };
  const closeIncident = (propertyId: string) => setIncidents((items) => items.filter((item) => item.propertyId !== propertyId));
  const ask = (label: string, verb: string, run: () => void) => setConfirmAction({ label, verb, run });

  /* ---------------- Home / landing ---------------- */
  if (role === "home") {
    return (
      <main>
        <TopBar role={role} setRole={setRole} />
        <section className="landing">
          <div className="hero">
            <div className="hero-copy">
              <p className="eyebrow">SafeHome — Emergency Response Platform</p>
              <h1 className="hero-title">Information that <em>arrives before&nbsp;you&nbsp;do.</em></h1>
              <p className="hero-lede">Homeowners map their property once. When seconds matter, operators and first responders see the layout, hazards, and live incident detail before they reach the door.</p>
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={() => setRole("owner")}>Enter homeowner workspace</button>
                <button className="btn btn-link" onClick={() => setRole("operator")}>Open operator console →</button>
              </div>
            </div>
            <div className="hero-visual"><ConsolePreview /></div>
          </div>

          <div className="landing-section">
            <div className="ls-head">
              <p className="eyebrow">Three roles, one source of truth</p>
              <h2 className="ls-title">Built for everyone in the emergency chain</h2>
            </div>
            <div className="role-grid">
              {[
                ["owner", "Homeowner", "Create properties, upload floor plans, and place permanent safety markers on the 3D model."],
                ["operator", "Emergency operator", "Search any property, open a live situation, and add incident-specific detail in seconds."],
                ["responder", "First responder", "Navigate the model on arrival with every homeowner and operator marker in view."],
              ].map(([r, title, body], i) => (
                <button className="role-tile" key={r} onClick={() => setRole(r as Role)}>
                  <span className="rt-index">0{i + 1}</span>
                  <b>{title}</b>
                  <p>{body}</p>
                  <span className="rt-go">Open workspace →</span>
                </button>
              ))}
            </div>
          </div>

          <div className="landing-section">
            <div className="ls-head">
              <p className="eyebrow">How it works</p>
              <h2 className="ls-title">From floor plan to front door</h2>
            </div>
            <ol className="steps-list">
              {[
                ["01", "Map the property", "Upload a floor plan and SafeHome builds a lightweight, interactive 3D model in the browser — no server rendering."],
                ["02", "Mark what matters", "Place points of interest for panels, valves, and hazards directly onto the model with a live gizmo."],
                ["03", "Respond informed", "Operators open a live situation and responders navigate with every marker visible on arrival."],
              ].map(([no, title, body]) => (
                <li className="step-item" key={no}>
                  <span className="si-no">{no}</span>
                  <div className="si-body"><b>{title}</b><p>{body}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    );
  }

  /* ---------------- Onboarding ---------------- */
  if (role === "owner" && draft) {
    const detailsReady = draft.address.trim().length > 0;
    return (
      <main>
        <TopBar role={role} setRole={goRole} />
        <div className="ws-bar">
          <button className="icon-btn" onClick={() => setDraft(undefined)} aria-label="Back to workspace">←</button>
          <div className="ws-heading">
            <span className="ws-context mono">Homeowner workspace</span>
            <div className="ws-heading-main"><strong>Add a property</strong></div>
          </div>
        </div>
        <section className="onboard">
          <ol className="steps">
            <li className={step >= 1 ? "on" : ""}><b>1</b> Property details</li>
            <li className={step >= 2 ? "on" : ""}><b>2</b> Floor plan</li>
          </ol>

          {step === 1 && (
            <div className="onboard-card">
              <p className="eyebrow">Step 1 of 2</p>
              <h1>Where is the property?</h1>
              <p className="lede">These details help operators locate the residence during an incident.</p>
              <label className="field"><span>Property name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Willow House" /></label>
              <label className="field"><span>Owner</span><input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} placeholder="Full name" /></label>
              <label className="field"><span>Address <em>*</em></span><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Street, suburb, city" /></label>
              <div className="onboard-actions">
                <span />
                <button className="btn btn-primary" disabled={!detailsReady} onClick={() => setStep(2)}>Continue →</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboard-card">
              <p className="eyebrow">Step 2 of 2</p>
              <h1>Upload the floor plan</h1>
              <p className="lede">A clean, high-contrast plan works best — white background, black walls. We build the 3D model locally in your browser.</p>
              <label className={`dropzone${draft.image ? " filled" : ""}`}>
                {draft.image
                  ? <img src={draft.image} alt="Floor plan preview" />
                  : <div className="dropzone-empty"><span className="di">↑</span><b>Choose an image</b><span>PNG or JPG floor plan</span></div>}
                <input type="file" accept="image/*" onChange={draftUpload} />
              </label>
              <div className="onboard-actions">
                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn-primary" disabled={!draft.image} onClick={finishOnboarding}>Create property</button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  /* ---------------- Property workspace ---------------- */
  if (property) {
    return (
      <main>
        <TopBar role={role} setRole={goRole} />
        <div className="ws-bar">
          <button className="icon-btn" onClick={leaveProperty} aria-label="Back to workspace">←</button>
          <div className="ws-heading">
            <span className="ws-context mono">{role === "owner" ? "Homeowner workspace" : role === "operator" ? "Operator console" : "Responder view"}</span>
            <div className="ws-heading-main">
              <strong>{property.name}</strong>
              <span className="ws-addr">{property.address}</span>
            </div>
          </div>
          <div className="ws-actions">
            {confirmAction ? (
              <div className="confirm-bar">
                <span>{confirmAction.label}</span>
                <button className="btn btn-danger btn-sm" onClick={() => { confirmAction.run(); setConfirmAction(undefined); }}>{confirmAction.verb}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmAction(undefined)}>Cancel</button>
              </div>
            ) : (
              <>
                <span className={incident ? "chip chip-live" : "chip chip-quiet"}>{incident ? <><i /> Incident live</> : "Property record"}</span>
                {role === "operator" && !incident && <button className="btn btn-primary btn-sm" onClick={createIncident}>Create incident</button>}
                {incident && (role === "operator" || role === "responder") && (
                  <button className="btn btn-danger btn-sm" onClick={() => ask(`Close the live incident at ${property.name}?`, "Close incident", () => { closeIncident(property.id); })}>Close incident</button>
                )}
                {role === "owner" && (
                  <button className="btn btn-danger btn-sm" onClick={() => ask(`Delete ${property.name}? This removes its floor plan and markers.`, "Delete", () => { deleteProperty(property.id); })}>Delete property</button>
                )}
              </>
            )}
          </div>
        </div>

        <section className="workspace">
          <div>
            <div className="viewer-intro">
              <p className="eyebrow">{incident ? "Situation monitoring" : "Property model"}</p>
              <h1>{property.address}</h1>
              <p>{editable
                ? "Pick a marker type, click the model to place it, then drag the gizmo to fine-tune along X, Y and Z."
                : "Read-only situation view. Navigate the model and review every homeowner and incident marker."}</p>
            </div>
            <FloorPlanViewer
              image={property.image}
              pois={pois}
              editable={editable}
              placing={!!placingType}
              selectedId={selectedPoi}
              onSelect={setSelectedPoi}
              onPlace={placePoi}
              onMove={move}
            />
          </div>

          <aside className="inspector">
            {canPlace && (
              <section className="panel">
                <p className="eyebrow">Add point of interest</p>
                <h2>Marker palette</h2>
                {placingType
                  ? <div className="placing-banner"><div><b>Placing “{placingType}”</b><span>Click the model to drop it, or press Esc.</span></div><button className="btn btn-ghost btn-sm" onClick={() => setPlacingType(undefined)}>Cancel</button></div>
                  : <p className="hint">Choose a type, then click the 3D model to place it.</p>}
                <div className="palette">
                  {POI_LIBRARY[activeKind].map((type) => (
                    <button key={type} className={placingType === type ? "active" : ""} onClick={() => { setSelectedPoi(undefined); setPlacingType(type); }}>
                      <i className={activeKind} />{type}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {selected && editable && (
              <section className="panel selected-card">
                <p className="eyebrow">Selected marker</p>
                <h2>{selected.type}</h2>
                <p className="hint">Drag the coloured arrows in the viewport to move it along X, Y and Z. No typing required.</p>
                <div className="selected-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPoi(undefined)}>Deselect</button>
                  <button className="btn btn-danger btn-sm" onClick={() => removePoi(selected.id)}>Remove</button>
                </div>
              </section>
            )}

            <section className="panel">
              <p className="eyebrow">Points of interest</p>
              <h2>Marker register</h2>
              {pois.length ? (
                <div className="register">
                  {pois.map((poi) => (
                    <button key={poi.id} className={selectedPoi === poi.id ? "chosen" : ""} onClick={() => { setPlacingType(undefined); setSelectedPoi(poi.id); }}>
                      <i className={poi.kind} />
                      <span><b>{poi.type}</b><span>{poi.kind === "owner" ? "Homeowner" : "Incident"} · {poi.label}</span></span>
                    </button>
                  ))}
                </div>
              ) : <p className="empty">No markers yet. Add only information that will help on arrival.</p>}
            </section>

            {role === "owner" && (
              <section className="panel">
                <p className="eyebrow">Floor plan</p>
                <h2>Source image</h2>
                <p className="hint">Uploading a new plan replaces the current one and regenerates the 3D model.</p>
                <label className="upload-btn">Replace floor plan<input type="file" accept="image/*" onChange={upload} /></label>
              </section>
            )}
          </aside>
        </section>
      </main>
    );
  }

  /* ---------------- Dashboards ---------------- */
  return (
    <main>
      <TopBar role={role} setRole={goRole} />

      {role === "owner" && (
        <section className="page">
          <div className="page-head">
            <div>
              <p className="eyebrow">Homeowner workspace</p>
              <h1>Your properties</h1>
            </div>
            <button className="btn btn-primary" onClick={startOnboarding}>New property</button>
          </div>
          <p className="page-sub">Manage floor plans and the permanent safety information responders rely on.</p>

          {properties.length ? (
            <div className="record-list">
              <div className="rl-legend">
                <span>Property</span>
                <span>Owner</span>
                <span>Markers</span>
                <span />
              </div>
              {properties.map((item) => (
                <div className="record-row" key={item.id}>
                  <button className="record-main" onClick={() => openProperty(item.id)}>
                    <span className="rr-primary">
                      <b>{item.name}</b>
                      <small>{item.address}</small>
                    </span>
                    <span className="rr-owner">{item.owner}</span>
                    <span className="rr-count">{item.pois.length}</span>
                    <span className="rr-go" aria-hidden>→</span>
                  </button>
                  <button className="record-del" aria-label={`Delete ${item.name}`} title="Delete property"
                    onClick={() => { if (window.confirm(`Delete ${item.name}? This removes its floor plan and markers.`)) deleteProperty(item.id); }}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-block">
              <p className="eyebrow">No properties yet</p>
              <h2>Add your first property</h2>
              <p>Upload a floor plan to generate a 3D model and start placing safety markers.</p>
            </div>
          )}
        </section>
      )}

      {role === "operator" && (
        <section className="page">
          <div className="search-wrap">
            <p className="eyebrow">Emergency operator</p>
            <h1>Find a property</h1>
            <p>Search by owner name or address, then open the record to create a live situation.</p>
            <div className="search-field">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search owner or address" />
              <span>⌕</span>
            </div>
            {query && (
              <div className="search-results">
                {results.map((item) => (
                  <button key={item.id} onClick={() => openProperty(item.id)}>
                    <div><b>{item.address}</b><span>{item.owner} · {item.name}</span></div>
                    <i>Open →</i>
                  </button>
                ))}
                {!results.length && <p className="search-empty">No matching property records.</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {role === "responder" && (
        <section className="page">
          <div className="page-head">
            <div>
              <p className="eyebrow coral">First responder</p>
              <h1>Active incidents</h1>
            </div>
          </div>
          <p className="page-sub">Read-only property models with every homeowner and operator marker for the current situation.</p>

          {incidents.length ? (
            <div className="record-list">
              <div className="rl-legend">
                <span>Incident</span>
                <span>Owner</span>
                <span>Markers</span>
                <span />
              </div>
              {incidents.map((item) => {
                const linked = properties.find((p) => p.id === item.propertyId);
                if (!linked) return null;
                return (
                  <div className="record-row" key={item.id}>
                    <button className="record-main" onClick={() => openProperty(linked.id)}>
                      <span className="rr-primary">
                        <b><span className="rr-live" />{linked.address}</b>
                        <small>{linked.name} · {item.created}</small>
                      </span>
                      <span className="rr-owner">{linked.owner}</span>
                      <span className="rr-count">{linked.pois.length + item.pois.length}</span>
                      <span className="rr-go" aria-hidden>→</span>
                    </button>
                    <button className="record-del" aria-label="Close incident" title="Close incident"
                      onClick={() => { if (window.confirm(`Close the live incident at ${linked.address}?`)) closeIncident(linked.id); }}>×</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-block">
              <p className="eyebrow">Standing by</p>
              <h2>No active incidents</h2>
              <p>Operator-created situations appear here automatically.</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ConsolePreview() {
  return (
    <div className="console-card">
      <div className="console-head">
        <span className="mono">Situation · SH-2049</span>
        <span className="console-live"><i /> Live</span>
      </div>
      <div className="console-title">18 Cedar Grove</div>
      <div className="console-sub">Brookfield · Willow House · Mira Patel</div>
      <div className="console-rows">
        <div className="console-row"><i className="operator" /><b>Fire origin — kitchen</b><span>Operator</span></div>
        <div className="console-row"><i className="owner" /><b>Electrical panel — hallway</b><span>Owner</span></div>
        <div className="console-row"><i className="owner" /><b>Gas valve — exterior wall</b><span>Owner</span></div>
      </div>
    </div>
  );
}
