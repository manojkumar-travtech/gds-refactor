export interface SabreConfig {
  pcc: string;
}

export interface QueueData {
  queueNumber: string;
  pnrs?: string[];
  response: any;
}

export interface QueueLogData {
  queueNumber: string;
  pnrCount: number;
  pcc: string;
}

export interface PnrDetails {
  [key: string]: any;
}

export interface StoreQueueDataResult {
  success: boolean;
  processed: number;
}
