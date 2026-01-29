import type { Config } from "next";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    DEFAULT: "#1F5D8C", // Brand Primary
                    50: "#E8F1F8",
                    100: "#CFE0EF",
                },
                action: {
                    DEFAULT: "#2F80ED", // Action/Accent
                    hover: "#256BC9",
                },
                userchat: "#3A7CA5",

                // --- STATUS COLORS ---
                success: {
                    DEFAULT: "#2E7D32",
                    light: "#E8F5E9",
                },
                pending: {
                    DEFAULT: "#4A90E2",
                    light: "#EDF5FD",
                },
                error: {
                    DEFAULT: "#C0392B",
                    light: "#F9EBEA",
                },
                disabled: "#BDBDBD",

                // --- SURFACES & TEXT ---
                surface: {
                    light: "#FFFFFF",
                    alt: "#EFEFEF",
                    dark: "#1C1C1C",
                    gray: "#F3F4F6", // Helper for background
                },
                text: {
                    primary: "#1A1A1A",
                    secondary: "#666666",
                    white: "#FFFFFF",
                }
            },
        },
    },
    plugins: [],
};
export default config;