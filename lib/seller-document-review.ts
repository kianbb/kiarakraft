export type ReviewDocument = {
  id: string;
  mime: string | null;
  bytes: number;
  createdAt: string;
  available: boolean;
  downloadPath: string | null;
};
export type DocumentReviewState = {
  sellerId: string | null;
  loading: boolean;
  unavailable: boolean;
  legacyReconciliationRequired: boolean;
  documents: ReviewDocument[];
};
export function emptyDocumentReview(
  sellerId: string | null,
  loading = false
): DocumentReviewState {
  return {
    sellerId,
    loading,
    unavailable: false,
    legacyReconciliationRequired: false,
    documents: [],
  };
}
// Selection can change before effects run: never render a prior seller's state.
export function documentReviewForSeller(
  sellerId: string | null,
  state: DocumentReviewState
) {
  return state.sellerId === sellerId
    ? state
    : emptyDocumentReview(sellerId, sellerId !== null);
}
function parseDocuments(
  value: unknown,
  sellerId: string
): { documents: ReviewDocument[]; legacyReconciliationRequired: boolean } {
  if (
    !value ||
    typeof value !== 'object' ||
    !('documents' in value) ||
    !Array.isArray(value.documents) ||
    value.documents.length > 100 ||
    !('legacyReconciliationRequired' in value) ||
    typeof value.legacyReconciliationRequired !== 'boolean'
  )
    throw Error();
  const documents = value.documents as ReviewDocument[];
  for (const doc of documents) {
    if (
      !doc ||
      typeof doc.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(doc.id) ||
      !Number.isSafeInteger(doc.bytes) ||
      doc.bytes < 0 ||
      typeof doc.createdAt !== 'string' ||
      typeof doc.available !== 'boolean' ||
      (doc.mime !== null &&
        !['application/pdf', 'image/png', 'image/jpeg'].includes(doc.mime))
    )
      throw Error();
    const expected = `/api/admin/sellers/${encodeURIComponent(sellerId)}/documents/${encodeURIComponent(doc.id)}`;
    if (
      doc.available ? doc.downloadPath !== expected : doc.downloadPath !== null
    )
      throw Error();
  }
  return {
    documents,
    legacyReconciliationRequired: value.legacyReconciliationRequired,
  };
}
export function createDocumentReviewLoader(
  fetchImpl: typeof fetch,
  emit: (state: DocumentReviewState) => void
) {
  let generation = 0;
  let controller: AbortController | undefined;
  return {
    select(sellerId: string | null, hasDocuments: boolean) {
      const current = ++generation;
      controller?.abort();
      emit(emptyDocumentReview(sellerId, sellerId !== null && hasDocuments));
      if (sellerId === null || !hasDocuments) return;
      controller = new AbortController();
      let response: Promise<Response>;
      try {
        response = fetchImpl(
          `/api/admin/sellers/${encodeURIComponent(sellerId)}/documents`,
          { signal: controller.signal, cache: 'no-store' }
        );
      } catch {
        emit({ ...emptyDocumentReview(sellerId), unavailable: true });
        return;
      }
      void response
        .then(async result => {
          if (!result.ok) throw Error();
          const parsed = parseDocuments(await result.json(), sellerId);
          if (current === generation)
            emit({ sellerId, loading: false, unavailable: false, ...parsed });
        })
        .catch(() => {
          if (current === generation)
            emit({ ...emptyDocumentReview(sellerId), unavailable: true });
        });
    },
    dispose() {
      generation++;
      controller?.abort();
    },
  };
}
