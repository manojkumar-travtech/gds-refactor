import { query } from "../../config/database";
import logger from "../../utils/logger";
import { ProfilesBaseService } from "../profile/profilesBase.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DBProfileRow {
  id: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  title?: string;
  gender?: string;
  date_of_birth?: string;
  phone?: string;
  email?: string;
  contact_info?: any;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

type ProfileChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};
export class ProfileDatabaseService extends ProfilesBaseService {
  constructor() {
    super();
  }

  public async getCompleteProfileFromDatabase(
    profileId: string,
  ): Promise<any | null> {
    try {
      const isUuid = UUID_REGEX.test(profileId);
      let dbProfile: DBProfileRow | undefined;

      if (!isUuid) {
        const lookupQuery = `
          SELECT p.*, u.email
          FROM profiles.profiles p
          JOIN core.users u ON p.user_id = u.id
          JOIN gds.gds_profiles gp ON p.id = gp.profile_id
          WHERE gp.gds_profile_id = $1
            AND gp.gds_provider = 'sabre'
          LIMIT 1
        `;

        const rows = await query<DBProfileRow>(lookupQuery, [profileId]);
        dbProfile = rows[0];
      } else {
        const directQuery = `
          SELECT p.*, u.email
          FROM profiles.profiles p
          JOIN core.users u ON p.user_id = u.id
          WHERE p.id = $1
          LIMIT 1
        `;

        const rows = await query<DBProfileRow>(directQuery, [profileId]);
        dbProfile = rows[0];
      }

      if (!dbProfile) {
        return null;
      }

      return {
        id: dbProfile.id,
        type: "TRAVELER",
        status: "ACTIVE",
        domain: this.sabreConfig.pcc,
        clientCode: this.sabreConfig.clientCode || "TN",
        clientContext: this.sabreConfig.clientContext || "TMP",
        created: new Date(dbProfile.created_at || Date.now()),
        updated: new Date(
          dbProfile.updated_at || dbProfile.created_at || Date.now(),
        ),
        personal: {
          firstName: dbProfile.first_name,
          lastName: dbProfile.last_name,
          middleName: dbProfile.middle_name,
          title: dbProfile.title,
          gender: dbProfile.gender || "U",
          dateOfBirth: dbProfile.date_of_birth,
        },
        contact: {
          emails: dbProfile.email
            ? [
                {
                  address: dbProfile.email,
                  type: "HOME",
                  isPrimary: true,
                },
              ]
            : [],
          phones: dbProfile.phone
            ? [
                {
                  number: dbProfile.phone,
                  type: "MOBILE",
                  isPrimary: true,
                },
              ]
            : [],
          addresses: dbProfile.contact_info?.addresses || [],
        },
        metadata: {
          ...(dbProfile.metadata || {}),
          lastUpdated: new Date().toISOString(),
          updatedBy: "system",
        },
      };
    } catch (error) {
      logger.error("Error fetching complete profile from database", {
        profileId,
        error: error instanceof Error ? error.message : error,
      });

      throw new Error(
        `Failed to fetch profile from database: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Deep merges incoming changes with the base profile.
   * - Only non-null & non-undefined fields are applied.
   * - Objects are merged recursively.
   * - Arrays and primitives are replaced.
   */
  public mergeProfileChanges<T extends Record<string, any>>(
    baseProfile: T,
    changes: Partial<T>,
  ): T {
    const merged = structuredClone(baseProfile);

    const mergeObjects = (target: any, source: any): any => {
      if (!source || typeof source !== "object") return target;

      for (const key of Object.keys(source)) {
        const sourceValue = source[key];
        if (sourceValue === undefined || sourceValue === null) continue;

        const targetValue = target[key];

        if (
          typeof sourceValue === "object" &&
          !Array.isArray(sourceValue) &&
          sourceValue !== null
        ) {
          target[key] = mergeObjects(
            typeof targetValue === "object" && targetValue !== null
              ? targetValue
              : {},
            sourceValue,
          );
        } else {
          target[key] = sourceValue;
        }
      }

      return target;
    };

    return mergeObjects(merged, changes);
  }

  public getProfileChanges<T extends Record<string, any>>(
    currentProfile: T,
    newProfile: T,
  ): ProfileChange[] {
    const changes: ProfileChange[] = [];

    const compareObjects = (obj1: any, obj2: any, path: string = ""): void => {
      const keys = new Set<string>([
        ...Object.keys(obj1 || {}),
        ...Object.keys(obj2 || {}),
      ]);

      for (const key of keys) {
        const currentPath = path ? `${path}.${key}` : key;
        const val1 = obj1?.[key];
        const val2 = obj2?.[key];

        // Skip if both undefined or null
        if (val1 === undefined && val2 === undefined) continue;
        if (val1 === null && val2 === null) continue;

        // Handle objects
        if (
          typeof val1 === "object" &&
          val1 !== null &&
          typeof val2 === "object" &&
          val2 !== null
        ) {
          // Arrays → direct comparison
          if (Array.isArray(val1) || Array.isArray(val2)) {
            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
              changes.push({
                field: currentPath,
                oldValue: val1,
                newValue: val2,
              });
            }
          } else {
            compareObjects(val1, val2, currentPath);
          }
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          changes.push({
            field: currentPath,
            oldValue: val1,
            newValue: val2,
          });
        }
      }
    };

    compareObjects(currentProfile, newProfile);

    return changes;
  }
}
