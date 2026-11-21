import { NextResponse } from 'next/server';

// Fixture creation runs through the guarded local CLI. Keep the legacy
// production seed disconnected from the application runtime.
export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
