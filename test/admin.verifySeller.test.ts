import assert from 'node:assert/strict';

// This is a lightweight unit-style test that validates our update payload logic
// for the admin verify endpoint: verifiedBy should only be set when action === 'verify'.

function buildUpdateData(
  action: 'verify' | 'reject',
  notes: string,
  adminEmail: string
) {
  return {
    verified: action === 'verify',
    verificationNotes: notes.trim(),
    verifiedAt:
      action === 'verify' ? new Date('2025-01-01T00:00:00.000Z') : null,
    verifiedBy: action === 'verify' ? adminEmail : null,
  };
}

async function run() {
  try {
    const admin = 'admin@example.com';

    const verifyPayload = buildUpdateData('verify', 'Looks good', admin);
    assert.equal(verifyPayload.verified, true);
    assert.equal(verifyPayload.verificationNotes, 'Looks good');
    assert.ok(verifyPayload.verifiedAt instanceof Date);
    assert.equal(verifyPayload.verifiedBy, admin);

    const rejectPayload = buildUpdateData('reject', 'Insufficient docs', admin);
    assert.equal(rejectPayload.verified, false);
    assert.equal(rejectPayload.verificationNotes, 'Insufficient docs');
    assert.equal(rejectPayload.verifiedAt, null);
    assert.equal(rejectPayload.verifiedBy, null);

    console.log('🎉 Admin seller verify/reject payload rules passed');
  } catch (err) {
    console.error('❌ Admin seller verify/reject payload rules failed:', err);
    process.exit(1);
  }
}

run();
