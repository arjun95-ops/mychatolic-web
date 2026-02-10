import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyCatholic Admin",
  description: "Administrative Dashboard for MyCatholic App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-surface-primary text-text-primary antialiased transition-colors`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="mychatolic-dashboard-theme"
        >
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "rgb(var(--surface-primary))",
                color: "rgb(var(--text-primary))",
                border: "1px solid rgb(var(--surface-secondary))",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
