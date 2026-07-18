import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";

export type User = { id: string; email: string; name: string; role: "owner" | "operator" | "responder" };

export async function backend(path: string, init: RequestInit = {}) {
	const { env } = await getCloudflareContext({ async: true });
	const cookie = (await cookies()).toString();
	return env.API.fetch(`https://safehome-api${path}`, {
		...init,
		headers: { ...(cookie ? { cookie } : {}), ...init.headers },
	});
}

export async function apiJson<T>(path: string, init: RequestInit = {}) {
	const response = await backend(path, init);
	if (!response.ok) {
		const body = await response.json<{ error?: string }>().catch((): { error?: string } => ({}));
		throw new Error(body.error ?? "Something went wrong.");
	}
	return response.json<T>();
}

export async function currentUser() {
	const response = await backend("/auth/me");
	if (!response.ok) return null;
	return (await response.json<{ user: User }>()).user;
}
