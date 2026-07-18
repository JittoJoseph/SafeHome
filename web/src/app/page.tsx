import { login, register } from "./actions";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
	const { error } = await searchParams;
	return <main className="auth-page">
		<section className="intro"><p className="eyebrow">SafeHome</p><h1>Clear home information when every second matters.</h1><p>Floor plans, critical infrastructure, and live incident details for first responders.</p></section>
		<section className="auth-card">{error && <p className="error">{error}</p>}<div className="forms"><form action={login}><h2>Sign in</h2><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" minLength={8} required /></label><button>Sign in</button></form><form action={register}><h2>Create homeowner account</h2><label>Name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" minLength={8} required /></label><button>Create account</button></form></div></section>
	</main>;
}
