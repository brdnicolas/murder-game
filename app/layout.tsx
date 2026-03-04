import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Murder Game",
  description: "Jeu de rôles : Meurtrier, Innocent, Justicier",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
