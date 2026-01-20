import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        status: 'online',
        message: 'MyCatholic API is running. Access endpoints like /api/export-master-data specifically.',
        timestamp: new Date().toISOString()
    });
}
