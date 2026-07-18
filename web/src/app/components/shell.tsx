import Link from "next/link";
import { logout } from "@/app/actions";
import type { User } from "@/lib/api";

export function Shell({ user, children }: { user: User; children: React.ReactNode }) {
	return <main className="shell"><header><Link href={`/${user.role}`} className="brand">SafeHome</Link><span>{user.name} · {user.role}</span><form action={logout}><button className="link-button">Sign out</button></form></header>{children}</main>;
}
