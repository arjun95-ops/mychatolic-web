import type { Config } from "next";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            // Kita kosongkan colors di sini agar tidak konflik dengan globals.css
            // Karena kita sudah definisikan manual @layer utilities di CSS
        },
    },
    plugins: [],
};
export default config;
