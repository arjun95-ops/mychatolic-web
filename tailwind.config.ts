import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        // Adding src paths just in case, though current structure seems to be flat in root based on previous context.
        // But adhering to USER REQUEST strictness is safer for path resolution.
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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