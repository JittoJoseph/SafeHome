import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";

type Role = "owner" | "operator" | "responder";
type User = { id: string; email: string; name: string; role: Role };
type Bindings = CloudflareBindings;
type AppEnv = { Bindings: Bindings; Variables: { user: User } };

const app = new Hono<AppEnv>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function error(message: string, status = 400) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function sessionExpiry() {
	return new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
}

function base64(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes));
}

function bytes(value: string) {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function passwordHash(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
	const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
		material,
		256,
	);
	return `${base64(salt)}:${base64(new Uint8Array(bits))}`;
}

async function passwordMatches(password: string, stored: string) {
	const [storedSalt, storedHash] = stored.split(":");
	if (!storedSalt || !storedHash) return false;
	const candidate = await passwordHash(password, bytes(storedSalt));
	const candidateHash = encoder.encode(candidate.split(":")[1]);
	const expectedHash = encoder.encode(storedHash);
	if (candidateHash.length !== expectedHash.length) return false;
	return crypto.subtle.timingSafeEqual(candidateHash, expectedHash);
}

async function requireUser(c: Context<AppEnv>) {
	const token = getCookie(c, "safehome_session");
	if (!token) return null;
	const row = await c.env.DB.prepare(
		"SELECT users.id, users.email, users.name, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > CURRENT_TIMESTAMP",
	)
		.bind(token)
		.first<User>();
	return row ?? null;
}

function roles(...allowed: Role[]): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const user = await requireUser(c);
		if (!user) return c.json({ error: "Authentication is required." }, 401);
		if (!allowed.includes(user.role)) return c.json({ error: "You do not have access to this action." }, 403);
		c.set("user", user);
		await next();
	};
}

async function propertyForUser(c: Context<AppEnv>, propertyId: string) {
	const property = await c.env.DB.prepare("SELECT id, owner_id, address, floor_plan_key, floor_plan_content_type, created_at, updated_at FROM properties WHERE id = ?")
		.bind(propertyId)
		.first<Record<string, string | null>>();
	if (!property) return null;
	const user = c.get("user");
	if (user.role === "owner" && property.owner_id !== user.id) return "forbidden";
	return property;
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/register", async (c) => {
	const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
	const email = body.email?.trim().toLowerCase();
	const name = body.name?.trim();
	if (!email || !name || !body.password || body.password.length < 8) return c.json({ error: "Name, email, and an 8-character password are required." }, 400);
	const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
	if (existing) return c.json({ error: "An account already exists for this email address." }, 409);
	const id = crypto.randomUUID();
	await c.env.DB.prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'owner')")
		.bind(id, email, name, await passwordHash(body.password))
		.run();
	const sessionId = crypto.randomUUID();
	await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionId, id, sessionExpiry().toISOString()).run();
	setCookie(c, "safehome_session", sessionId, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", expires: sessionExpiry() });
	return c.json({ user: { id, email, name, role: "owner" } }, 201);
});

app.post("/auth/login", async (c) => {
	const body = await c.req.json<{ email?: string; password?: string }>();
	const email = body.email?.trim().toLowerCase();
	if (!email || !body.password) return c.json({ error: "Email and password are required." }, 400);
	const user = await c.env.DB.prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?").bind(email).first<User & { password_hash: string }>();
	if (!user || !(await passwordMatches(body.password, user.password_hash))) return c.json({ error: "Email or password is incorrect." }, 401);
	const sessionId = crypto.randomUUID();
	const expiresAt = sessionExpiry();
	await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionId, user.id, expiresAt.toISOString()).run();
	setCookie(c, "safehome_session", sessionId, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", expires: expiresAt });
	return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.post("/auth/logout", async (c) => {
	const token = getCookie(c, "safehome_session");
	if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
	deleteCookie(c, "safehome_session", { path: "/" });
	return c.body(null, 204);
});

app.get("/auth/me", roles("owner", "operator", "responder"), (c) => c.json({ user: c.get("user") }));

app.get("/properties", roles("owner"), async (c) => {
	const properties = await c.env.DB.prepare("SELECT id, address, floor_plan_key IS NOT NULL AS has_floor_plan, created_at, updated_at FROM properties WHERE owner_id = ? ORDER BY updated_at DESC")
		.bind(c.get("user").id)
		.all();
	return c.json({ properties: properties.results });
});

app.post("/properties", roles("owner"), async (c) => {
	const body = await c.req.json<{ address?: string }>();
	const address = body.address?.trim();
	if (!address) return c.json({ error: "An address is required." }, 400);
	const id = crypto.randomUUID();
	await c.env.DB.prepare("INSERT INTO properties (id, owner_id, address) VALUES (?, ?, ?)").bind(id, c.get("user").id, address).run();
	return c.json({ id, address }, 201);
});

app.get("/properties/:id", roles("owner", "operator", "responder"), async (c) => {
	const property = await propertyForUser(c, c.req.param("id"));
	if (!property) return c.json({ error: "Property not found." }, 404);
	if (property === "forbidden") return c.json({ error: "You do not have access to this property." }, 403);
	const pois = await c.env.DB.prepare("SELECT id, creator_role, type, label, position_x, position_y, position_z, situation_id FROM pois WHERE property_id = ? ORDER BY created_at DESC")
		.bind(property.id)
		.all();
	return c.json({ property, pois: pois.results });
});

app.put("/properties/:id/floor-plan", roles("owner"), async (c) => {
	const property = await propertyForUser(c, c.req.param("id"));
	if (!property) return c.json({ error: "Property not found." }, 404);
	if (property === "forbidden") return c.json({ error: "You do not have access to this property." }, 403);
	const contentType = c.req.header("content-type") ?? "";
	if (!contentType.startsWith("image/")) return c.json({ error: "A floor plan image is required." }, 400);
	const key = `floor-plans/${property.id}`;
	await c.env.FLOOR_PLANS.put(key, c.req.raw.body, { httpMetadata: { contentType } });
	await c.env.DB.prepare("UPDATE properties SET floor_plan_key = ?, floor_plan_content_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
		.bind(key, contentType, property.id)
		.run();
	return c.json({ key });
});

app.get("/properties/:id/floor-plan", roles("owner", "operator", "responder"), async (c) => {
	const property = await propertyForUser(c, c.req.param("id"));
	if (!property) return c.json({ error: "Property not found." }, 404);
	if (property === "forbidden") return c.json({ error: "You do not have access to this property." }, 403);
	if (!property.floor_plan_key) return c.json({ error: "No floor plan has been uploaded." }, 404);
	const object = await c.env.FLOOR_PLANS.get(property.floor_plan_key);
	if (!object) return c.json({ error: "Floor plan not found." }, 404);
	return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/png" } });
});

app.post("/properties/:id/pois", roles("owner", "operator"), async (c) => {
	const property = await propertyForUser(c, c.req.param("id"));
	if (!property) return c.json({ error: "Property not found." }, 404);
	if (property === "forbidden") return c.json({ error: "You do not have access to this property." }, 403);
	const body = await c.req.json<{ type?: string; label?: string; position?: { x?: number; y?: number; z?: number }; situationId?: string }>();
	const user = c.get("user");
	const allowedTypes = user.role === "owner" ? ["Electrical Panel", "Gas Valve", "Gas Cylinder"] : ["Fire Origin", "Trapped Victim"];
	if (!body.type || !allowedTypes.includes(body.type) || !body.label?.trim() || body.position?.x === undefined || body.position.y === undefined || body.position.z === undefined) return c.json({ error: "Provide a valid POI type, label, and position." }, 400);
	if (user.role === "operator" && !body.situationId) return c.json({ error: "Operator POIs must belong to a situation." }, 400);
	if (body.situationId) {
		const situation = await c.env.DB.prepare("SELECT id FROM situations WHERE id = ? AND property_id = ? AND status = 'active'").bind(body.situationId, property.id).first();
		if (!situation) return c.json({ error: "The situation is not active for this property." }, 400);
	}
	const id = crypto.randomUUID();
	await c.env.DB.prepare("INSERT INTO pois (id, property_id, creator_id, creator_role, situation_id, type, label, position_x, position_y, position_z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(id, property.id, user.id, user.role, body.situationId ?? null, body.type, body.label.trim(), body.position.x, body.position.y, body.position.z)
		.run();
	return c.json({ id }, 201);
});

app.get("/search", roles("operator"), async (c) => {
	const query = c.req.query("q")?.trim();
	if (!query) return c.json({ properties: [] });
	const properties = await c.env.DB.prepare("SELECT properties.id, properties.address, users.name AS owner_name FROM properties JOIN users ON users.id = properties.owner_id WHERE properties.address LIKE ? OR users.name LIKE ? ORDER BY properties.updated_at DESC LIMIT 10")
		.bind(`%${query}%`, `%${query}%`)
		.all();
	return c.json({ properties: properties.results });
});

app.post("/situations", roles("operator"), async (c) => {
	const body = await c.req.json<{ propertyId?: string }>();
	if (!body.propertyId) return c.json({ error: "A property is required." }, 400);
	const property = await c.env.DB.prepare("SELECT id FROM properties WHERE id = ?").bind(body.propertyId).first();
	if (!property) return c.json({ error: "Property not found." }, 404);
	const id = crypto.randomUUID();
	await c.env.DB.prepare("INSERT INTO situations (id, property_id, created_by, status) VALUES (?, ?, ?, 'active')").bind(id, body.propertyId, c.get("user").id).run();
	return c.json({ id, propertyId: body.propertyId, status: "active" }, 201);
});

app.get("/situations", roles("operator", "responder"), async (c) => {
	const situations = await c.env.DB.prepare("SELECT situations.id, situations.status, situations.created_at, properties.id AS property_id, properties.address, users.name AS owner_name FROM situations JOIN properties ON properties.id = situations.property_id JOIN users ON users.id = properties.owner_id WHERE situations.status = 'active' ORDER BY situations.created_at DESC")
		.all();
	return c.json({ situations: situations.results });
});

app.get("/situations/:id", roles("operator", "responder"), async (c) => {
	const situation = await c.env.DB.prepare("SELECT id, property_id, status, created_at FROM situations WHERE id = ?").bind(c.req.param("id")).first<Record<string, string>>();
	if (!situation) return c.json({ error: "Situation not found." }, 404);
	const property = await c.env.DB.prepare("SELECT id, address, floor_plan_key, floor_plan_content_type FROM properties WHERE id = ?").bind(situation.property_id).first();
	const pois = await c.env.DB.prepare("SELECT id, creator_role, type, label, position_x, position_y, position_z, situation_id FROM pois WHERE property_id = ? AND (creator_role = 'owner' OR situation_id = ?) ORDER BY created_at DESC").bind(situation.property_id, situation.id).all();
	return c.json({ situation, property, pois: pois.results });
});

export default app;
