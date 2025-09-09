#!/usr/bin/env tsx

/**
 * Create AuditLog table manually
 * This script creates the AuditLog table without running a full migration
 */

import { prisma } from '../lib/prisma';

async function createAuditLogTable() {
  console.log('Creating AuditLog table...');
  
  try {
    // Create the AuditLog table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "userId" TEXT,
        "userEmail" TEXT,
        "userRole" TEXT,
        "targetId" TEXT,
        "targetType" TEXT,
        "metadata" JSONB,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "success" BOOLEAN NOT NULL,
        "errorMessage" TEXT,
        "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Create indexes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AuditLog_targetId_idx" ON "AuditLog"("targetId");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AuditLog_ipAddress_idx" ON "AuditLog"("ipAddress");
    `);
    
    console.log('✅ AuditLog table created successfully');
    
    // Verify the table was created
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'AuditLog'
      );
    `;
    
    console.log('Table verification:', tableExists);
    
  } catch (error) {
    console.error('Error creating AuditLog table:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAuditLogTable();