import { CanonicalProfile } from '../models/canonical-profile.model';
import { SyncConfig, SyncStrategy, MergeResult, AuditLog, FieldChange } from '../models/sync-config.model';
import { v4 as uuidv4 } from 'uuid';

export class ProfileSyncService {
  
  /**
   * Merges a GDS profile into a Master profile based on the provided configuration.
   * Returns the new Master profile state and an audit log of changes.
   */
  mergeProfiles(
    masterProfile: CanonicalProfile,
    gdsProfile: CanonicalProfile,
    config: SyncConfig
  ): MergeResult {
    const changes: FieldChange[] = [];
    const conflicts: string[] = [];
    
    // Deep clone master to start with
    const mergedProfile = JSON.parse(JSON.stringify(masterProfile));

    // We need to compare every field in GDS profile against Master
    // We'll traverse the GDS profile structure
    this.compareAndMerge(
      masterProfile,
      gdsProfile,
      mergedProfile,
      '',
      config,
      changes,
      conflicts
    );

    const auditLog: AuditLog = {
      id: uuidv4(),
      profileId: masterProfile.id,
      gdsProfileId: gdsProfile.id,
      timestamp: new Date(),
      action: changes.length > 0 ? 'MERGE' : 'SYNC',
      details: `Merged GDS profile ${gdsProfile.id} into Master ${masterProfile.id} using ${config.defaultStrategy}`,
      changes,
      triggeredBy: 'SYSTEM'
    };

    return {
      mergedProfile,
      auditLog,
      conflicts
    };
  }

  private compareAndMerge(
    master: any,
    gds: any,
    target: any,
    path: string,
    config: SyncConfig,
    changes: FieldChange[],
    conflicts: string[]
  ) {
    // Base cases
    if (gds === undefined || gds === null) return;

    // If primitive or array (treating arrays as atomic for now, or simple replacement)
    if (typeof gds !== 'object' || Array.isArray(gds) || gds instanceof Date) {
      this.evaluateField(master, gds, target, path, config, changes);
      return;
    }

    // Recursive case for objects
    for (const key of Object.keys(gds)) {
      // Skip metadata/provenance for direct merge, handle them separately if needed
      // Also skip 'id' to preserve Master Profile ID
      if (key === 'metadata' || key === 'provenance' || key === 'id') continue;

      const newPath = path ? `${path}.${key}` : key;
      const masterValue = master ? master[key] : undefined;
      const gdsValue = gds[key];

      if (typeof gdsValue === 'object' && !Array.isArray(gdsValue) && !(gdsValue instanceof Date) && gdsValue !== null) {
        // Ensure target has the structure
        if (!target[key]) target[key] = {};
        this.compareAndMerge(masterValue, gdsValue, target[key], newPath, config, changes, conflicts);
      } else {
        this.evaluateField(masterValue, gdsValue, target, key, config, changes, newPath);
      }
    }
  }

  private evaluateField(
    masterValue: any,
    gdsValue: any,
    targetParent: any,
    targetKey: string,
    config: SyncConfig,
    changes: FieldChange[],
    fullPath?: string
  ) {
    const path = fullPath || targetKey;
    
    // Determine strategy for this field
    let strategy = config.defaultStrategy;
    if (config.fieldOverrides && config.fieldOverrides[path]) {
      strategy = config.fieldOverrides[path];
    }

    // If values are equal, no action needed
    if (this.isEqual(masterValue, gdsValue)) return;

    // If Master is empty and GDS has value, usually we take GDS value regardless of strategy (filling gaps)
    // Unless strategy is strictly INHERITED and we want to enforce empty? 
    // Usually "filling gaps" is desirable.
    if (this.isEmpty(masterValue) && !this.isEmpty(gdsValue)) {
      targetParent[targetKey] = gdsValue;
      changes.push({
        fieldPath: path,
        oldValue: masterValue,
        newValue: gdsValue,
        source: 'GDS',
        reason: 'Master value was empty, filled from GDS'
      });
      return;
    }

    // If GDS is empty, do nothing (don't overwrite master with null)
    if (this.isEmpty(gdsValue)) return;

    // Apply Strategy
    switch (strategy) {
      case SyncStrategy.INHERITED:
      case SyncStrategy.MASTER_WINS:
        // Master wins, do nothing as target is already clone of master
        break;

      case SyncStrategy.GDS_WINS:
        targetParent[targetKey] = gdsValue;
        changes.push({
          fieldPath: path,
          oldValue: masterValue,
          newValue: gdsValue,
          source: 'GDS',
          reason: 'Strategy is GDS_WINS'
        });
        break;

      case SyncStrategy.LATEST_SYNC:
        // We need timestamps. 
        // In a real scenario, we'd look at `provenance` for field-level timestamps.
        // For this MVP, we might rely on the top-level `updated` or `metadata.lastSyncDate` 
        // if field-level provenance isn't available.
        // Let's assume we can't easily get field-level timestamps passed down here yet without complex plumbing.
        // So we'll default to: If GDS value is different, we assume it's "newer" in the context of an import 
        // UNLESS we have specific provenance.
        
        // TODO: Implement robust provenance check. 
        // For now, we'll assume "Latest Sync" means "Accept Incoming GDS Change" if it differs, 
        // effectively acting like GDS_WINS during an import event, 
        // BUT in a bi-directional sync, we'd compare dates.
        
        // Let's try to be smarter:
        // If we are processing an "Import", GDS is the "New" data.
        // If we assume Master is the "Old" data.
        targetParent[targetKey] = gdsValue;
        changes.push({
          fieldPath: path,
          oldValue: masterValue,
          newValue: gdsValue,
          source: 'GDS',
          reason: 'LATEST_SYNC: Updating with incoming GDS data'
        });
        break;
        
      case SyncStrategy.MANUAL:
        // Log conflict?
        break;
    }
  }

  private isEmpty(val: any): boolean {
    return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
  }

  private isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.isEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!keysB.includes(key) || !this.isEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }
}
