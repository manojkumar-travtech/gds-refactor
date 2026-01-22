export enum SyncStrategy {
  INHERITED = 'INHERITED',       // Master -> GDS (Master always wins)
  LATEST_SYNC = 'LATEST_SYNC',   // Bidirectional based on timestamp (Newest wins)
  GDS_WINS = 'GDS_WINS',         // GDS -> Master (GDS always wins)
  MASTER_WINS = 'MASTER_WINS',   // Master -> GDS (Master always wins, alias for INHERITED)
  MANUAL = 'MANUAL'              // No auto-sync
}

export interface SyncConfig {
  defaultStrategy: SyncStrategy;
  fieldOverrides?: {
    [fieldPath: string]: SyncStrategy; // e.g., "personal.firstName": "INHERITED"
  };
  autoMergeThreshold?: number; // Confidence score required for auto-merge
}

export interface AuditLog {
  id: string;
  profileId: string;
  gdsProfileId: string;
  timestamp: Date;
  action: 'MERGE' | 'SYNC' | 'OVERRIDE' | 'CONFLICT';
  details: string;
  changes: FieldChange[];
  triggeredBy: 'SYSTEM' | 'USER';
}

export interface FieldChange {
  fieldPath: string;
  oldValue: any;
  newValue: any;
  source: 'MASTER' | 'GDS';
  reason: string; // e.g., "GDS timestamp (2023-10-01) is newer than Master (2023-09-01)"
}

export interface MergeResult {
  mergedProfile: any; // CanonicalProfile
  auditLog: AuditLog;
  conflicts?: string[];
}
