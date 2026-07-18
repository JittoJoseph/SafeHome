import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "SafeHome",
	description: "Home information for emergency response.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
			</head>
			<body>{children}</body>
		</html>
	);
}
