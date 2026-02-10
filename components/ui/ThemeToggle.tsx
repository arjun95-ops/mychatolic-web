"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

type ThemeToggleProps = {
    className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
    const { setTheme, resolvedTheme } = useTheme();
    const currentTheme = resolvedTheme === "dark" ? "dark" : "light";

    return (
        <button
            onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-secondary bg-surface-primary text-text-secondary transition-colors hover:border-action/40 hover:bg-surface-secondary hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40 ${className}`}
            aria-label={currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>
    );
}
