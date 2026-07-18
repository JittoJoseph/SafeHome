import { backend } from "@/lib/api";

export async function GET(_: Request, { params }: { params: Promise<{ propertyId: string }> }) {
	const { propertyId } = await params;
	const response = await backend(`/properties/${propertyId}/floor-plan`);
	return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "image/png" } });
}
