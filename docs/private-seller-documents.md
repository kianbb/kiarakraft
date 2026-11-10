# Verification-document access

This candidate separates verification documents from ordinary product images. It does not replace, delete, rename or re-upload existing assets. Existing `SellerDocument` URLs, identifiers and profile folders remain intact.

The nullable forward migration classifies existing rows as legacy. The application no longer returns their CDN URLs or opens them as a fallback. An existing folder can contain documents that were never recorded in the database; an empty database list is therefore not proof that the folder is empty. Collection remains unavailable for sellers with a legacy folder or unclassified records until a separately reviewed provider reconciliation is complete. Existing public asset URLs may remain accessible outside the application until that provider work is performed.

Collection is off by default. The server-only `SELLER_DOCUMENT_COLLECTION_ENABLED` must be the literal `true` before new collection can run; this is not set automatically by Cloudinary credentials. Isolated local and staging modes continue to deny collection regardless of that setting. Existing private-document retrieval remains separately authorized and does not depend on the collection setting. Global activation requires approved provider reconciliation and the collection/retention policy first: absent database rows or a null folder do not establish that an existing seller has no orphaned legacy assets.

For new managed documents, the server reserves an opaque ID under a per-seller database lock before upload. Pending, failed and ready reservations all count toward the five-document cap. A failed or ambiguous upload retains its private reference for deliberate reconciliation; the application does not guess whether an asset exists or delete it automatically. Provider failure or failure to persist ready metadata cannot return upload success.

New uploads use authenticated Cloudinary delivery and server-generated names. Onboarding accepts document IDs and resolves only ready, authenticated records owned by the submitting seller. File-size and stream limits, detected MIME/signature checks and limited active-content heuristics reject invalid inputs. These checks are not antivirus scanning or a complete PDF parser and do not certify that a document is malware-free.

Admin lists expose only document metadata, availability and an application download route. Every download rechecks the current database-backed admin role and seller/document association. Signing and provider requests stay server-side; the browser receives a bounded attachment with private/no-store, nosniff, no-referrer and restrictive content-security headers. No signed provider URL is returned in JSON or a redirect. Review state is bound to the selected seller, so an old or late response cannot display another seller's documents in the current review.

The local launcher continues to remove provider credentials, and staging continues to deny identity/document collection. Synthetic SDK/HTTP tests establish local request and authorization contracts, not actual Cloudinary storage/delivery or lockdown of old URLs. Live provider verification, legacy-asset reconciliation, document necessity, retention/deletion policy and production enablement remain separate reviewed work.

Verification includes the database-free document security suite, guarded PostgreSQL reservation/concurrency/ownership/legacy/migration regressions, the normal verification/build checks, and bilingual rendering checks against an explicit local server. No test should use hosted seller documents or an existing asset URL as a fixture.

## Rollout boundary

Apply the nullable forward migration only through a separately reviewed migration operation before releasing code that queries the new metadata. Builds continue to perform no migrations. Old writers and immutable deployments must remain contained while collection is disabled; an older writer can still create public/unclassified assets. Do not bulk-mark existing references as authenticated/ready, guess ownership from their URLs, replay a seed, or invoke cleanup scripts as deployment preparation. Existing-asset inventory, preservation, access changes and verification require their own provider-reviewed plan.

## Local verification

The isolated task checkout replayed all sixteen migrations on its own loopback development and test databases. `npm run verify`, `npm run test:integration`, and `npm run build:local` passed. The document unit suite exercises actual handlers and installed SDK signing/upload behavior using synthetic transports with real sockets trapped; PostgreSQL tests cover concurrent reservation limits, ready-document ownership, legacy preservation and nullable migration behavior. Known pre-existing framework/lint warnings and nine development-tool advisories remain visible; no dependency or scanner exception was introduced.

The guarded production build served at an explicit loopback URL for `npm run test:i18n` and `npm run test:application`; both passed, including Persian/English home/explore language/direction, real local login/session/ownership, and HTML/RSC privacy checks. These checks do not certify a live provider, old URL revocation, full document UI accessibility or production readiness. Independent browser/security review is recorded separately by the coordinator.
