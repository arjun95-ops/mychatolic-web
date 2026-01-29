'use client';

import VerificationManager from '@/components/verification/VerificationManager';

export default function VerificationPage() {
    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* 
        Tidak perlu header tambahan di sini karena VerificationManager
        sudah memiliki Header "Manajemen Data User" di dalamnya.
      */}
            <VerificationManager />
        </div>
    );
}
