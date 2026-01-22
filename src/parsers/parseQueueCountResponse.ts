/**
 * Generic SOAP attribute wrapper
 */
interface SoapAttributes {
  [key: string]: string;
}

/**
 * Generic SOAP node with attributes
 */
interface SoapNode<T extends SoapAttributes = SoapAttributes> {
  $: T;
}

/**
 * Queue identifier attributes
 */
interface QueueIdentifierAttrs extends SoapAttributes {
  Number: string;
  Count: string;
}

/**
 * Queue total attributes
 */
interface QueueTotalAttrs extends SoapAttributes {
  Type: string;
  Count: string;
}

/**
 * QueueCountRS generic shape
 */
export interface QueueCountRS<
  Q extends SoapNode = SoapNode<QueueIdentifierAttrs>,
  T extends SoapNode = SoapNode<QueueTotalAttrs>,
> {
  QueueInfo?: {
    QueueIdentifier?: Q | Q[];
  };
  Totals?: T | T[];
}

/**
 * Parsed queue item
 */
export interface ParsedQueue {
  queueNumber: string;
  count: number;
}

/**
 * Final parsed result
 */
export interface ParsedQueueCountResult {
  success: boolean;
  queueNumber: string | number | null;
  queues: ParsedQueue[];
  totalMessages: number;
  totalSpecials: number;
  totalPNRs: number;
  timestamp: Date;
}

/**
 * Utility: normalize value to array
 */
const asArray = <T>(value?: T | T[]): T[] =>
  value ? (Array.isArray(value) ? value : [value]) : [];

/**
 * Generic & pure QueueCount parser
 */
export function parseQueueCountResponse<
  R extends Record<string, unknown>,
  Q extends SoapNode<QueueIdentifierAttrs>,
  T extends SoapNode<QueueTotalAttrs>,
>(
  response: R,
  queueNumber: string | number | null = null,
  options?: {
    envelopeKey?: string;
    bodyKey?: string;
    responseKey?: string;
  },
): ParsedQueueCountResult {
  const {
    envelopeKey = "soap-env:Envelope",
    bodyKey = "soap-env:Body",
    responseKey = "QueueCountRS",
  } = options ?? {};

  const envelope = (response as any)[envelopeKey] ?? (response as any).Envelope;

  if (!envelope) {
    throw new Error("Invalid response: Missing SOAP envelope");
  }

  const body = envelope[bodyKey] ?? envelope.Body;

  if (!body) {
    throw new Error("Invalid response: Missing SOAP body");
  }

  const queueCountRS = body[responseKey] ?? body.queueCountRS;

  if (!queueCountRS) {
    throw new Error("Invalid response: Missing QueueCountRS");
  }

  const queues: ParsedQueue[] = asArray<Q>(
    queueCountRS?.QueueInfo?.QueueIdentifier,
  ).map((q) => ({
    queueNumber: q.$.Number,
    count: Number.parseInt(q.$.Count, 10) || 0,
  }));

  const totalsMap: Record<string, number> = {};

  asArray<T>(queueCountRS.Totals).forEach((total) => {
    const type = total.$.Type.toLowerCase();
    totalsMap[type] = Number.parseInt(total.$.Count, 10) || 0;
  });

  return {
    success: true,
    queueNumber,
    queues,
    totalMessages: totalsMap.messages ?? 0,
    totalSpecials: totalsMap.specials ?? 0,
    totalPNRs: totalsMap.pnrs ?? 0,
    timestamp: new Date(),
  };
}
