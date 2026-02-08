"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Content */}
            <div className="relative bg-surface-primary dark:bg-surface-inverse rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 border border-surface-secondary dark:border-surface-secondary/20">
                {/* Header */}
                <div className="px-6 py-4 border-b border-surface-secondary dark:border-surface-secondary/20 flex justify-between items-center bg-surface-secondary/50 dark:bg-surface-inverse/50">
                    <h3 className="text-lg font-bold text-text-primary dark:text-text-inverse">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-text-secondary dark:text-text-secondary/80 hover:text-text-primary dark:hover:text-text-inverse p-1 rounded-full hover:bg-surface-secondary dark:hover:bg-surface-secondary/20 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
