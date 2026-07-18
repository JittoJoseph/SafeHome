"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backend } from "@/lib/api";

async function auth(path: string, formData: FormData) {
	const response = await backend(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(Object.fromEntries(formData)),
	});
	if (!response.ok) {
		const body = await response.json<{ error?: string }>();
		redirect(`/?error=${encodeURIComponent(body.error ?? "Unable to sign in.")}`);
	}
	const session = response.headers.get("set-cookie")?.match(/safehome_session=([^;]+)/)?.[1];
	if (!session) redirect("/?error=Unable to establish a session.");
	(await cookies()).set("safehome_session", session, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 7 });
	const { user } = await response.json<{ user: { role: string } }>();
	redirect(`/${user.role}`);
}

export async function login(formData: FormData) { await auth("/auth/login", formData); }
export async function register(formData: FormData) { await auth("/auth/register", formData); }

export async function logout() {
	await backend("/auth/logout", { method: "POST" });
	(await cookies()).delete("safehome_session");
	redirect("/");
}

export async function createProperty(formData: FormData) {
	const response = await backend("/properties", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: formData.get("address") }) });
	if (!response.ok) redirect("/owner?error=Unable to create property.");
	const { id } = await response.json<{ id: string }>();
	redirect(`/owner/properties/${id}`);
}

export async function uploadFloorPlan(propertyId: string, formData: FormData) {
	const file = formData.get("floorPlan");
	if (!(file instanceof File) || !file.type.startsWith("image/")) redirect(`/owner/properties/${propertyId}?error=Choose an image file.`);
	const response = await backend(`/properties/${propertyId}/floor-plan`, { method: "PUT", headers: { "content-type": file.type }, body: file.stream() });
	if (!response.ok) redirect(`/owner/properties/${propertyId}?error=Unable to upload floor plan.`);
	redirect(`/owner/properties/${propertyId}`);
}

export async function createSituation(formData: FormData) {
	const response = await backend("/situations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId: formData.get("propertyId") }) });
	if (!response.ok) redirect("/operator?error=Unable to create situation.");
	const { id } = await response.json<{ id: string }>();
	redirect(`/operator/situations/${id}`);
}

export async function createPoi(propertyId: string, situationId: string | undefined, formData: FormData) {
	const response = await backend(`/properties/${propertyId}/pois`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: formData.get("type"), label: formData.get("label"), situationId, position: { x: Number(formData.get("x")), y: Number(formData.get("y")), z: Number(formData.get("z")) } }) });
	if (!response.ok) redirect(situationId ? `/operator/situations/${situationId}` : `/owner/properties/${propertyId}`);
	redirect(situationId ? `/operator/situations/${situationId}` : `/owner/properties/${propertyId}`);
}
