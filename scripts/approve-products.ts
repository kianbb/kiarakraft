import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Status = 'APPROVED' | 'REVIEW' | 'REJECTED' | 'PENDING';

function getArg(name: string): string | undefined {
  const pref = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(pref));
  return found ? found.slice(pref.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const all = hasFlag('all');
  const id = getArg('id');
  const slug = getArg('slug');
  const status = (getArg('status') as Status | undefined) || 'APPROVED';
  const reason = getArg('reason') || 'Manual moderation';
  const confidenceStr = getArg('confidence');
  const dryRun = hasFlag('dry-run');

  if (!all && !id && !slug) {
    console.log(
      'Usage: tsx scripts/approve-products.ts [--all] [--id=<id>] [--slug=<slug>] [--status=APPROVED|REVIEW|REJECTED|PENDING] [--reason="..."] [--confidence=0..100] [--dry-run]'
    );
    process.exit(1);
  }

  if (!['APPROVED', 'REVIEW', 'REJECTED', 'PENDING'].includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const confidence = confidenceStr
    ? Math.max(0, Math.min(100, parseInt(confidenceStr)))
    : undefined;

  if (all) {
    const where = {
      active: true,
      eligibilityStatus: { in: ['PENDING', 'REVIEW'] as Status[] },
    };
    const toUpdate = await prisma.product.count({ where });
    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, matching: toUpdate }));
      return;
    }
    const res = await prisma.product.updateMany({
      where,
      data: {
        eligibilityStatus: status,
        ...(confidence !== undefined
          ? { eligibilityConfidence: confidence }
          : {}),
        eligibilityReasons: reason,
      },
    });
    console.log(JSON.stringify({ updated: res.count, status }));
    return;
  }

  const product = await prisma.product.findFirst({
    where: {
      OR: [id ? { id } : undefined, slug ? { slug } : undefined].filter(
        Boolean
      ) as any,
    },
  });
  if (!product) {
    console.error('Product not found');
    process.exit(2);
  }

  if (dryRun) {
    console.log(
      JSON.stringify({
        dryRun: true,
        product: { id: product.id, slug: product.slug },
        newStatus: status,
      })
    );
    return;
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      eligibilityStatus: status,
      ...(confidence !== undefined
        ? { eligibilityConfidence: confidence }
        : {}),
      eligibilityReasons: reason,
    },
  });
  console.log(
    JSON.stringify({
      updated: {
        id: updated.id,
        slug: updated.slug,
        status: updated.eligibilityStatus,
      },
    })
  );
}

main().finally(() => prisma.$disconnect());
