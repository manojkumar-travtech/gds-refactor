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
  Q extends SoapNode<QueueIdentifierAttrs>,
  T extends SoapNode<QueueTotalAttrs>,
>(
  response: { QueueCountRS?: QueueCountRS<Q, T> },
  queueNumber: string | number | null = null,
): ParsedQueueCountResult {
  const queueCountRS = response?.QueueCountRS;

  if (!queueCountRS) {
    throw new Error("Invalid response: Missing QueueCountRS");
  }

  // ---- Validate application status ----
  const appResults =
    (queueCountRS as any)["stl:ApplicationResults"] ||
    (queueCountRS as any).ApplicationResults;

  const status = appResults?.$?.status;

  if (status && status !== "Complete") {
    throw new Error(`QueueCountRS returned status: ${status}`);
  }

  // ---- Extract timestamp ----
  const timestampStr =
    appResults?.["stl:Success"]?.$?.timeStamp ||
    appResults?.Success?.$?.timeStamp;

  const timestamp = timestampStr ? new Date(timestampStr) : new Date();

  // ---- Parse queues ----
  const queues: ParsedQueue[] = asArray<Q>(
    queueCountRS.QueueInfo?.QueueIdentifier,
  ).map((q) => ({
    queueNumber: q.$.Number,
    count: Number.parseInt(q.$.Count, 10) || 0,
  }));

  // ---- Parse totals ----
  const totalsMap: Record<string, number> = {};

  asArray<T>(queueCountRS.Totals).forEach((t) => {
    const type = t.$.Type.toLowerCase();
    totalsMap[type] = Number.parseInt(t.$.Count, 10) || 0;
  });

  return {
    success: true,
    queueNumber,
    queues,
    totalMessages: totalsMap.messages ?? 0,
    totalSpecials: totalsMap.specials ?? 0,
    totalPNRs: totalsMap.pnrs ?? 0,
    timestamp,
  };
}

