import type { Prisma } from '@prisma/client';

export const RETURN_WINDOW_DAYS = 30;

const tehranDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Tehran',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function tehranCalendarDay(timestamp: number) {
  const { year, month, day } = Object.fromEntries(
    tehranDate.formatToParts(timestamp).map(({ type, value }) => [type, value])
  );
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000;
}

function explicitTimestamp(value: Prisma.JsonValue | undefined) {
  if (typeof value !== 'string') return NaN;
  const iso =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value
    );
  if (!iso) return NaN;
  // Date.parse can normalize out-of-range days into the following month.
  const date = new Date(`${iso[1]}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    !date.toISOString().startsWith(iso[1])
  ) {
    return NaN;
  }
  return Date.parse(value);
}

function recordedDelivery(
  history: Prisma.JsonValue | undefined,
  createdAt: Date,
  now: number
) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) {
    return null;
  }
  if (!Array.isArray(history.events)) return null;

  let earliest = Infinity;
  for (const event of history.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (event.status !== 'DELIVERED') continue;
    // The older seller writer recorded actual transitions. Untyped admin
    // entries can also be tracking edits or catch-ups from Order.updatedAt.
    if (
      event.kind !== 'transition' &&
      !(event.kind === undefined && event.updatedBy === 'SELLER')
    ) {
      continue;
    }
    const timestamp = explicitTimestamp(event.timestamp);
    if (timestamp >= createdAt.getTime() && timestamp <= now) {
      earliest = Math.min(earliest, timestamp);
    }
  }
  return earliest === Infinity ? null : earliest;
}

export function returnIneligibility(
  order: {
    status: string;
    createdAt: Date;
    payment?: { status: string } | null;
    shipping?: { history: Prisma.JsonValue } | null;
  },
  now = Date.now()
) {
  if (order.payment?.status !== 'PAID') return 'unpaid';
  if (order.status !== 'DELIVERED') return 'undelivered';

  const deliveredAt = recordedDelivery(
    order.shipping?.history,
    order.createdAt,
    now
  );
  if (deliveredAt === null) return 'delivery_unconfirmed';

  const daysSinceDelivery =
    tehranCalendarDay(now) - tehranCalendarDay(deliveredAt);
  return daysSinceDelivery > RETURN_WINDOW_DAYS ? 'expired' : null;
}
