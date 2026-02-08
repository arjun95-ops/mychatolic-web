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
                    primary: "rgb(var(--brand-primary) / <alpha-value>)",
                },
                action: "rgb(var(--action) / <alpha-value>)",
                "user-chat": "rgb(var(--user-chat) / <alpha-value>)",
                surface: {
                    primary: "rgb(var(--surface-primary) / <alpha-value>)",
                    secondary: "rgb(var(--surface-secondary) / <alpha-value>)",
                    inverse: "rgb(var(--surface-inverse) / <alpha-value>)",
                },
                text: {
                    primary: "rgb(var(--text-primary) / <alpha-value>)",
                    secondary: "rgb(var(--text-secondary) / <alpha-value>)",
                    inverse: "rgb(var(--text-inverse) / <alpha-value>)",
                },
                status: {
                    success: "rgb(var(--status-success) / <alpha-value>)",
                    pending: "rgb(var(--status-pending) / <alpha-value>)",
                    error: "rgb(var(--status-error) / <alpha-value>)",
                    disabled: "rgb(var(--status-disabled) / <alpha-value>)",
                },
            },
        },
    },
    plugins: [],
};
export default config;