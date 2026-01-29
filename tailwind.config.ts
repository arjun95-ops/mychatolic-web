import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}"
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    primary: "var(--brand-primary)",
                },
                action: "var(--action)",
                surface: {
                    primary: "var(--surface-primary)",
                    secondary: "var(--surface-secondary)",
                },
                text: {
                    primary: "var(--text-primary)",
                    secondary: "var(--text-secondary)",
                },
                status: {
                    success: "var(--status-success)",
                    pending: "var(--status-pending)",
                    error: "var(--status-error)",
                    disabled: "var(--status-disabled)",
                },
            },
        },
    },
    plugins: [],
};
export default config;