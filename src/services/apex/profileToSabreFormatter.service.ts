import { CompleteProfileData } from "./getProfilesFromApex.service";

/**
 * Sabre Profile Format Interface
 */
export interface SabreProfileFormat {
  profileId: string;
  clientCode?: string;
  clientContext?: string;
  domain?: string;
  ignoreTimeStampCheck?: boolean;
  customer: {
    personName?: {
      namePrefix?: string;
      givenName?: string;
      middleName?: string;
      surName?: string;
    };
    knownTravelerNumber?: string;
    redressNumber?: string;
    birthDate?: string;
    countryOfResidence?: string;
    nationalityCode?: string;
    genderCode?: string;
    telephone?: {
      fullPhoneNumber?: string;
    };
    email?: {
      emailAddress?: string;
    };
    address?: {
      addressLine?: string;
      cityName?: string;
      stateCode?: string;
      countryCode?: string;
    };
    paymentForms?: Array<{
      cardType?: string;
      cardNumber?: string;
      cardHolderName?: string;
      expiryDate?: string;
    }>;
    emergencyContacts?: Array<{
      relationTypeCode?: string;
      relationType?: string;
      birthDate?: string;
      displaySequenceNo?: number;
      orderSequenceNo?: number;
      informationText?: string;
      namePrefix?: string;
      givenName?: string;
      surName?: string;
      nameSuffix?: string;
      telephones?: Array<{
        fullPhoneNumber?: string;
        locationTypeCode?: string;
        deviceTypeCode?: string;
        purposeCode?: string;
        displaySequenceNo?: number;
        orderSequenceNo?: number;
      }>;
      email?: {
        emailAddress?: string;
        emailTypeCode?: string;
        emailUsageCode?: string;
        formatTypeCode?: string;
        purposeCode?: string;
        displaySequenceNo?: number;
        orderSequenceNo?: number;
      };
      address?: {
        locationTypeCode?: string;
        addressUsageTypeCode?: string;
        attention?: string;
        displaySequenceNo?: number;
        orderSequenceNo?: number;
        addressLine?: string;
        cityName?: string;
        postalCode?: string;
        stateCode?: string;
        countryCode?: string;
      };
    }>;
    documents?: Array<{
      docType?: string;
      docNumber?: string;
      docHolderName?: string;
      issuingCountry?: string;
      issueDate?: string;
      expiryDate?: string;
      birthDate?: string;
      genderCode?: string;
      holderNationalityCode?: string;
      surName?: string;
      givenName?: string;
      middleName?: string;
    }>;
    loyaltyPrograms?: Array<{
      programId?: string;
      membershipId?: string;
      vendorType?: string;
      programTypeCode?: string;
      givenName?: string;
      middleName?: string;
      surName?: string;
      membershipLevel?: string;
      membershipLevelTypeCode?: string;
      displaySequenceNo?: number;
      orderSequenceNo?: number;
    }>;
  };
  preferences?: {
    airlinePreferences?: any[];
    hotelPreferences?: any[];
    vehicleRentalPreferences?: any[];
  };
  remarks?: Array<{
    key?: string;
    value?: string;
    categoryCode?: string;
  }>;
  ignoreSubjectAreas?: string[];
}

/**
 * Profile Data to Sabre Format Transformer
 */
export class ProfileToSabreFormatter {
  /**
   * Transform complete profile data to Sabre format
   */
  public formatToSabreProfile(
    profileData: CompleteProfileData,
    options?: {
      clientCode?: string;
      clientContext?: string;
      domain?: string;
      ignoreTimeStampCheck?: boolean;
      includePreferences?: boolean;
      ignoreSubjectAreas?: string[];
    },
  ): SabreProfileFormat {
    const primaryEmail = this.getPrimaryEmail(profileData.emails);
    const primaryPhone = this.getPrimaryPhone(profileData.phones);
    const primaryAddress = this.getPrimaryAddress(profileData.addresses);

    const sabreProfile: SabreProfileFormat = {
      profileId: profileData.sabreProfileId || profileData.profileId,
      clientCode: options?.clientCode || "TN",
      clientContext: options?.clientContext || "TMP",
      domain: options?.domain || "6YIB",
      ignoreTimeStampCheck: options?.ignoreTimeStampCheck ?? true,
      customer: {
        telephone: primaryPhone
          ? {
              fullPhoneNumber: primaryPhone.number,
            }
          : undefined,
        email: primaryEmail
          ? {
              emailAddress: primaryEmail.address,
            }
          : undefined,
        address: primaryAddress
          ? {
              addressLine: primaryAddress.line1,
              cityName: primaryAddress.city || undefined,
              stateCode: primaryAddress.state || undefined,
              countryCode: primaryAddress.country || undefined,
            }
          : undefined,
        paymentForms: this.formatPaymentForms(profileData.paymentMethods),
        emergencyContacts: this.formatEmergencyContacts(
          profileData.emergencyContacts,
        ),
        documents: this.formatDocuments(profileData.travelDocuments),
        loyaltyPrograms: this.formatLoyaltyPrograms(
          profileData.loyaltyPrograms,
        ),
      },
    };

    // Add preferences if requested
    if (options?.includePreferences) {
      sabreProfile.preferences = {
        airlinePreferences: [],
        hotelPreferences: [],
        vehicleRentalPreferences: [],
      };
    }

    // Add ignoreSubjectAreas if provided
    if (options?.ignoreSubjectAreas && options.ignoreSubjectAreas.length > 0) {
      sabreProfile.ignoreSubjectAreas = options.ignoreSubjectAreas;
    }

    // Remove undefined fields
    return this.cleanUndefined(sabreProfile);
  }

  /**
   * Get primary email or first email
   */
  private getPrimaryEmail(emails: any[]): any | null {
    if (!emails || emails.length === 0) return null;
    return emails.find((e) => e.is_primary) || emails[0];
  }

  /**
   * Get primary phone or first phone
   */
  private getPrimaryPhone(phones: any[]): any | null {
    if (!phones || phones.length === 0) return null;
    return phones.find((p) => p.is_primary) || phones[0];
  }

  /**
   * Get primary address or first address
   */
  private getPrimaryAddress(addresses: any[]): any | null {
    if (!addresses || addresses.length === 0) return null;
    return addresses.find((a) => a.is_primary) || addresses[0];
  }

  /**
   * Format payment methods to Sabre paymentForms
   */
  private formatPaymentForms(paymentMethods: any[]): any[] | undefined {
    if (!paymentMethods || paymentMethods.length === 0) return undefined;

    return paymentMethods.map((payment) => {
      // Extract expiry date parts
      const expiryMonth = payment.expiry_month
        ? String(payment.expiry_month).padStart(2, "0")
        : "12";
      const expiryYear = payment.expiry_year
        ? String(payment.expiry_year).slice(-2)
        : "99";

      return {
        cardType: this.mapCardType(payment.card_type),
        cardNumber: payment.card_token || `****${payment.card_last_four}`,
        cardHolderName: payment.billing_name || undefined,
        expiryDate: `${expiryMonth}${expiryYear}`,
      };
    });
  }

  /**
   * Map internal card type to Sabre card type codes
   */
  private mapCardType(cardType: string): string {
    const mapping: Record<string, string> = {
      visa: "VI",
      mastercard: "MC",
      amex: "AX",
      "american express": "AX",
      discover: "DS",
      diners: "DC",
      jcb: "JC",
    };

    return mapping[cardType?.toLowerCase()] || cardType?.toUpperCase() || "VI";
  }

  /**
   * Format emergency contacts to Sabre format
   */
  private formatEmergencyContacts(contacts: any[]): any[] | undefined {
    if (!contacts || contacts.length === 0) return undefined;

    return contacts.map((contact, index) => {
      // Parse name into parts (assuming format: "FirstName LastName" or similar)
      const nameParts = this.parseName(contact.name);

      const formattedContact: any = {
        relationTypeCode: this.mapRelationshipCode(contact.relationship),
        relationType: contact.relationship || "Other",
        displaySequenceNo: index + 1,
        orderSequenceNo: index + 1,
        namePrefix: nameParts.prefix || undefined,
        givenName: nameParts.givenName,
        surName: nameParts.surName,
        nameSuffix: nameParts.suffix || undefined,
      };

      // Add phone if available
      if (contact.phone) {
        formattedContact.telephones = [
          {
            fullPhoneNumber: contact.phone,
            locationTypeCode: "HOM",
            deviceTypeCode: "VC",
            displaySequenceNo: 1,
            orderSequenceNo: 1,
          },
        ];
      }

      // Add email if available
      if (contact.email) {
        formattedContact.email = {
          emailAddress: contact.email,
          emailTypeCode: "BUS",
          displaySequenceNo: 1,
          orderSequenceNo: 1,
        };
      }

      return formattedContact;
    });
  }

  /**
   * Parse full name into components
   */
  private parseName(fullName: string): {
    prefix?: string;
    givenName: string;
    middleName?: string;
    surName: string;
    suffix?: string;
  } {
    if (!fullName) {
      return { givenName: "N/A", surName: "N/A" };
    }

    const prefixes = ["MR", "MRS", "MS", "DR", "PROF"];
    const suffixes = ["JR", "SR", "II", "III", "IV"];

    const parts = fullName.trim().split(/\s+/);
    let prefix: string | undefined;
    let suffix: string | undefined;
    let nameParts = [...parts];

    // Check for prefix
    if (prefixes.includes(parts[0]?.toUpperCase().replace(".", ""))) {
      prefix = parts[0];
      nameParts = nameParts.slice(1);
    }

    // Check for suffix
    const lastPart = nameParts[nameParts.length - 1];
    if (
      lastPart &&
      suffixes.includes(lastPart.toUpperCase().replace(".", ""))
    ) {
      suffix = lastPart;
      nameParts = nameParts.slice(0, -1);
    }

    // Remaining parts: first, middle, last
    if (nameParts.length === 0) {
      return { prefix, givenName: "N/A", surName: "N/A", suffix };
    } else if (nameParts.length === 1) {
      return { prefix, givenName: nameParts[0], surName: nameParts[0], suffix };
    } else if (nameParts.length === 2) {
      return {
        prefix,
        givenName: nameParts[0],
        surName: nameParts[1],
        suffix,
      };
    } else {
      // 3+ parts: first middle(s) last
      return {
        prefix,
        givenName: nameParts[0],
        middleName: nameParts.slice(1, -1).join(" "),
        surName: nameParts[nameParts.length - 1],
        suffix,
      };
    }
  }

  /**
   * Map relationship to Sabre relationship code
   */
  private mapRelationshipCode(relationship?: string): string {
    const mapping: Record<string, string> = {
      spouse: "SP",
      parent: "PR",
      child: "CH",
      sibling: "SB",
      friend: "FR",
      colleague: "CL",
      other: "OT",
    };

    return mapping[relationship?.toLowerCase() || "other"] || "FR";
  }

  /**
   * Format travel documents to Sabre format
   */
  private formatDocuments(documents: any[]): any[] | undefined {
    if (!documents || documents.length === 0) return undefined;

    return documents.map((doc) => {
      const formattedDoc: any = {
        docType: this.mapDocumentType(doc.type),
        docNumber: doc.document_number,
        issuingCountry: doc.issuing_country || undefined,
        issueDate: this.formatDate(doc.issue_date),
        expiryDate: this.formatDate(doc.expiry_date),
      };

      // Parse document holder name if available
      if (doc.document_data?.holder_name || doc.document_data?.name) {
        const holderName =
          doc.document_data.holder_name || doc.document_data.name;
        formattedDoc.docHolderName = holderName;

        // Try to parse name parts
        const nameParts = this.parseName(holderName);
        formattedDoc.surName = nameParts.surName;
        formattedDoc.givenName = nameParts.givenName;
        if (nameParts.middleName) {
          formattedDoc.middleName = nameParts.middleName;
        }
      }

      // Add additional fields from document_data if available
      if (doc.document_data) {
        if (doc.document_data.birth_date) {
          formattedDoc.birthDate = this.formatDate(
            doc.document_data.birth_date,
          );
        }
        if (doc.document_data.gender) {
          formattedDoc.genderCode = doc.document_data.gender;
        }
        if (doc.document_data.nationality) {
          formattedDoc.holderNationalityCode = doc.document_data.nationality;
        }
      }

      return formattedDoc;
    });
  }

  /**
   * Map document type to Sabre document type codes
   */
  private mapDocumentType(type?: string): string {
    const mapping: Record<string, string> = {
      passport: "PSPT",
      visa: "VISA",
      drivers_license: "DRVR",
      national_id: "NATL",
      redress: "RDRS",
      known_traveler: "KTID",
      other: "OTHR",
    };

    return mapping[type?.toLowerCase() || "other"] || "OTHR";
  }

  /**
   * Format loyalty programs to Sabre format
   */
  private formatLoyaltyPrograms(programs: any[]): any[] | undefined {
    if (!programs || programs.length === 0) return undefined;

    return programs.map((program, index) => {
      const formattedProgram: any = {
        programId: program.provider_code,
        membershipId: program.member_number,
        vendorType: this.mapProviderType(program.provider_type),
        programTypeCode: "FT", // Frequent Traveler
        displaySequenceNo: index + 1,
        orderSequenceNo: index + 1,
      };

      // Add member name if available
      if (program.member_name) {
        const nameParts = this.parseName(program.member_name);
        formattedProgram.givenName = nameParts.givenName;
        formattedProgram.surName = nameParts.surName;
        if (nameParts.middleName) {
          formattedProgram.middleName = nameParts.middleName;
        }
      }

      // Add tier/status level if available
      if (program.tier_level || program.tier_status) {
        formattedProgram.membershipLevel =
          program.tier_level || program.tier_status;
        formattedProgram.membershipLevelTypeCode = "ST"; // Status
      }

      return formattedProgram;
    });
  }

  /**
   * Map provider type to Sabre vendor type
   */
  private mapProviderType(providerType?: string): string {
    const mapping: Record<string, string> = {
      airline: "AL",
      hotel: "HT",
      car: "CR",
      rail: "RL",
      other: "OT",
    };

    return mapping[providerType?.toLowerCase() || "airline"] || "AL";
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private formatDate(date: any): string | undefined {
    if (!date) return undefined;

    try {
      if (typeof date === "string") {
        // If already in correct format
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
        // Try to parse and format
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split("T")[0];
        }
      } else if (date instanceof Date) {
        return date.toISOString().split("T")[0];
      }
    } catch (error) {
      // Return undefined if date parsing fails
    }

    return undefined;
  }

  /**
   * Remove undefined values from object recursively
   */
  private cleanUndefined(obj: any): any {
    if (Array.isArray(obj)) {
      return obj
        .map((item) => this.cleanUndefined(item))
        .filter((item) => item !== undefined);
    }

    if (obj !== null && typeof obj === "object") {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = this.cleanUndefined(value);
        }
      }
      return cleaned;
    }

    return obj;
  }
}

// Export singleton instance
export const profileToSabreFormatter = new ProfileToSabreFormatter();
