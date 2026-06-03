import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Measles Evidence Dashboard",
  description:
    "Evergreen evidence dashboard for measles in pregnancy and measles vaccine second-dose interval evidence."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
