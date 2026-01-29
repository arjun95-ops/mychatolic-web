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
                    DEFAULT: "#1F5D8C",
                    50: "#E8F1F8",
                    100: "#CFE0EF",
                },
                action: {
                    DEFAULT: "#2F80ED",
                    hover: "#256BC9",
                },
                success: "#2E7D32",
                pending: "#4A90E2",
                error: "#C0392B",
                surface: {
                    gray: "#F3F4F6",
                    white: "#FFFFFF",
                },
            },
        },
    },
    plugins: [],
};
export default config;
