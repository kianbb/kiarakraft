import { NextResponse } from 'next/server';

export async function GET() {
  const buildId = process.env.VERCEL_DEPLOYMENT_ID || process.env.NEXT_BUILD_ID || 'development';
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';
  const host = process.env.VERCEL_URL || process.env.HOST || 'localhost';
  
  return NextResponse.json({
    buildId,
    commit: commit.substring(0, 7), // Short commit hash
    host,
    now: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
}