import {
  CanonicalProfile,
  ProfileType,
  ProfileStatus,
  PersonalInfo,
  ContactInfo,
  EmailAddress,
  PhoneNumber,
  Address,
  EmploymentInfo,
  EmergencyContact,
  RelatedTraveler,
  TravelDocument,
  DocumentType,
  LoyaltyProgram,
  PaymentMethod,
  PaymentType,
  TravelPreferences,
  AirlinePreference,
  HotelPreference,
  CarPreference,
  PreferenceLevel,
  Remark,
  RemarkType,
  GDSSource,
  Gender,
  SeatPosition,
  SmokingPreference,
  TransmissionType
} from '../models/canonical-profile.model';

/**
 * Parser for converting Sabre XML profile data to canonical format
 */
export class SabreProfileParser {
  /**
   * Parse a Sabre profile to canonical format
   */
  parse(raw: any): CanonicalProfile {
    const identity = raw.TPA_Identity?.$  || raw.TPA_Identity || {};
    const traveler = raw.Traveler || {};
    const agent = raw.TravelAgent || {};
    
    // Determine which type of profile we're dealing with
    // Check both direct properties and Customer sub-object
    const isTraveler = !!traveler.PersonName || !!traveler.Telephone || !!traveler.Customer;

    const customFields = {
      clientCode: identity.ClientCode,
      clientContext: identity.ClientContextCode,
      domainGroupingID: identity.DomainGroupingID,
      primaryLanguage: raw.$?.PrimaryLanguageIDCode,
      ...this.parseCustomDefinedData(raw)
    };

    const profile: CanonicalProfile = {
      id: identity.UniqueID || '',
      profileName: identity.ProfileName,
      type: this.mapProfileType(identity.ProfileTypeCode),
      domain: identity.DomainID,
      status: this.mapProfileStatus(identity.ProfileStatusCode),
      created: raw.$?.CreateDateTime ? new Date(raw.$.CreateDateTime) : undefined,
      updated: raw.$?.UpdateDateTime ? new Date(raw.$.UpdateDateTime) : undefined,
      personal: this.parsePersonalInfo(isTraveler ? traveler : agent, identity.ProfileName),
      contact: this.parseContactInfo(traveler),
      employment: this.parseEmploymentInfo(traveler, customFields),
      emergencyContacts: this.parseEmergencyContacts(traveler),
      relatedTravelers: this.parseRelatedTravelers(traveler),
      travelPolicy: this.parseTravelPolicy(traveler),
      taxInfo: this.parseTaxInfo(traveler),
      documents: this.parseTravelDocuments(traveler),
      loyalty: this.parseLoyaltyPrograms(traveler),
      paymentMethods: this.parsePaymentMethods(traveler),
      preferences: this.parseTravelPreferences(raw),
      remarks: this.parseRemarks(raw),
      metadata: {
        sourceGDS: GDSSource.SABRE,
        sourceId: identity.UniqueID || '',
        sourcePCC: identity.DomainID || 'Unknown',
        lastSyncDate: new Date(),
        syncVersion: '1.0',
        customFields: customFields
      }
    };

    return profile;
  }

  /**
   * Parse custom defined data
   */
  private parseCustomDefinedData(raw: any): Record<string, any> {
    const extensions = raw.Traveler?.TPA_Extensions || raw.TPA_Extensions || {};
    const customData = this.safeArray(extensions.CustomDefinedData);
    
    const result: Record<string, any> = {};
    
    customData.forEach(cd => {
      const attrs = cd.$ || {};
      // Use InformationText as key if available, otherwise CustomFieldCode
      const key = attrs.InformationText || attrs.CustomFieldCode;
      if (key && attrs.Value) {
        // Clean up key to be camelCase-ish or at least valid JSON key
        const cleanKey = key.replace(/\s+/g, '_').toLowerCase();
        result[cleanKey] = attrs.Value;
      }
    });
    
    return result;
  }

  /**
   * Parse personal information
   */
  private parsePersonalInfo(source: any, fallbackProfileName?: string): PersonalInfo {
    // For traveler profiles, PersonName is under Customer
    const customer = source.Customer || source;
    const personName = customer.PersonName || customer.AgentName || {};
    
    let firstName = personName.GivenName || personName.$?.GivenName;
    let lastName = personName.SurName || personName.$?.SurName || personName.Surname || personName.$?.Surname;
    let middleName = personName.MiddleName || personName.$?.MiddleName;
    let title = personName.NamePrefix || personName.$?.NamePrefix;
    let suffix = personName.NameSuffix || personName.$?.NameSuffix;

    // Fallback: Try to parse from ProfileName if structured name is missing
    if ((!firstName || !lastName) && fallbackProfileName) {
      const parsed = this.parseProfileName(fallbackProfileName);
      if (parsed) {
        firstName = firstName || parsed.firstName;
        lastName = lastName || parsed.lastName;
        title = title || parsed.title;
      }
    }
    
    return {
      firstName,
      lastName,
      middleName,
      title,
      suffix,
      dob: customer.$?.BirthDate ? new Date(customer.$.BirthDate) : undefined,
      gender: this.mapGender(customer.$?.Gender)
    };
  }

  /**
   * Parse profile name string (e.g. "SMITH/JOHN MR")
   */
  private parseProfileName(profileName: string): { firstName: string, lastName: string, title?: string } | null {
    if (!profileName) return null;
    
    // Handle format: LASTNAME/FIRSTNAME TITLE
    const parts = profileName.split('/');
    if (parts.length < 2) return null;

    const lastName = parts[0].trim();
    let remainder = parts[1].trim();
    let firstName = remainder;
    let title: string | undefined;

    // Check for common titles at the end
    const titleMatch = remainder.match(/\s+(MR|MRS|MS|DR|MISS|MSTR|PROF|REV)$/i);
    if (titleMatch) {
      title = titleMatch[1];
      firstName = remainder.substring(0, titleMatch.index).trim();
    }

    return { firstName, lastName, title };
  }

  /**
   * Parse contact information
   */
  private parseContactInfo(traveler: any): ContactInfo {
    // For traveler profiles, contact info can be under Customer
    const customer = traveler.Customer || traveler;
    
    return {
      emails: this.parseEmails(customer.Email || customer.RelatedIndividual?.Email),
      phones: this.parsePhones(customer.Telephone),
      addresses: this.parseAddresses(customer.Address)
    };
  }

  /**
   * Parse email addresses
   */
  private parseEmails(emailData: any): EmailAddress[] {
    if (!emailData) return [];
    
    const emails = Array.isArray(emailData) ? emailData : [emailData];
    
    return emails.map(e => ({
      type: e.$?.EmailTypeCode || e.$?.Type || 'Unknown',
      address: e.$?.EmailAddress || e._ || '',
      primary: e.$?.DefaultInd === 'true' || e.$?.Primary === 'true'
    }));
  }

  /**
   * Parse phone numbers
   */
  private parsePhones(phoneData: any): PhoneNumber[] {
    if (!phoneData) return [];
    
    const phones = Array.isArray(phoneData) ? phoneData : [phoneData];
    
    return phones.map(p => {
      const attrs = p.$ || {};
      let number = p.FullPhoneNumber || attrs.FullPhoneNumber || '';
      
      // Construct number if split into components
      if (!number && attrs.PhoneNumber) {
        const parts = [];
        if (attrs.CountryAccessCode) parts.push(attrs.CountryAccessCode);
        if (attrs.AreaCityCode) parts.push(attrs.AreaCityCode);
        parts.push(attrs.PhoneNumber);
        number = parts.join('-');
      }

      return {
        type: attrs.LocationTypeCode || attrs.PhoneLocationType || 'Unknown',
        number,
        countryCode: attrs.CountryAccessCode,
        extension: attrs.Extension,
        primary: attrs.DefaultInd === 'true'
      };
    });
  }

  /**
   * Parse addresses
   */
  private parseAddresses(addressData: any): Address[] {
    if (!addressData) return [];
    
    const addresses = Array.isArray(addressData) ? addressData : [addressData];
    
    return addresses.map(a => {
      const attrs = a.$ || {};
      const lines = this.safeArray(a.AddressLine);
      
      return {
        type: attrs.LocationTypeCode || attrs.Type || 'Unknown',
        line1: lines[0],
        line2: lines[1],
        line3: lines[2],
        city: a.CityName || a.City,
        state: a.StateCode || a.StateProv || a.State,
        zip: a.PostalCd || a.PostalCode || a.ZIP,
        country: a.CountryCode || a.Country,
        primary: attrs.DefaultInd === 'true'
      };
    });
  }

  /**
   * Parse travel documents
   */
  private parseTravelDocuments(traveler: any): TravelDocument[] {
    const customer = traveler.Customer || traveler;
    if (!customer.Document) return [];
    
    const documents = this.safeArray(customer.Document);
    
    return documents.map(doc => {
      const attrs = doc.$ || {};
      const docHolder = doc.DocHolder || {};
      
      return {
        type: this.mapDocumentType(attrs.DocTypeCode),
        number: attrs.DocID || '',
        issuingCountry: attrs.DocIssueCountryCode,
        citizenship: attrs.DocHolderNationality,
        effectiveDate: attrs.EffectiveDate ? new Date(attrs.EffectiveDate) : undefined,
        expirationDate: attrs.ExpireDate ? new Date(attrs.ExpireDate) : undefined,
        holderName: `${docHolder.GivenName || attrs.DocHolderGivenName || ''} ${docHolder.SurName || attrs.DocHolderSurName || ''}`.trim()
      };
    });
  }

  /**
   * Parse loyalty programs
   */
  private parseLoyaltyPrograms(traveler: any): LoyaltyProgram[] {
    const customer = traveler.Customer || traveler;
    if (!customer.CustLoyalty) return [];
    
    const loyalties = this.safeArray(customer.CustLoyalty);
    
    return loyalties.map(l => {
      const attrs = l.$ || {};
      
      return {
        programName: attrs.ProgramID || attrs.VendorCode || '',
        providerType: 'AIRLINE', // Default to AIRLINE for now, could infer from vendor
        providerName: attrs.VendorCode || '',
        number: attrs.MembershipID || '',
        tier: attrs.LoyalLevel || attrs.TierLevel,
        expirationDate: attrs.ExpireDate ? new Date(attrs.ExpireDate) : undefined
      };
    });
  }

  /**
   * Parse payment methods
   */
  private parsePaymentMethods(traveler: any): PaymentMethod[] {
    const customer = traveler.Customer || traveler;
    if (!customer.PaymentForm) return [];
    
    const payments = this.safeArray(customer.PaymentForm);
    
    return payments.map(pf => {
      const card = pf.PaymentCard || {};
      const attrs = card.$ || {};
      
      return {
        type: PaymentType.CREDIT_CARD,
        cardType: attrs.CardType || attrs.CardCode,
        maskedNumber: attrs.CardNumber,
        expiration: attrs.ExpireDate,
        holderName: card.CardHolderName || attrs.CardHolderName
      };
    });
  }

  /**
   * Parse travel preferences
   */
  private parseTravelPreferences(raw: any): TravelPreferences {
    const traveler = raw.Traveler || {};
    const prefCollections = traveler.PrefCollections || raw.PrefCollections || {};
    
    return {
      airlines: this.parseAirlinePreferences(prefCollections.AirlinePref),
      hotels: this.parseHotelPreferences(prefCollections.HotelPref),
      cars: this.parseCarPreferences(prefCollections.VehicleRentalPref)
    };
  }

  /**
   * Parse airline preferences
   */
  private parseAirlinePreferences(airlineData: any): AirlinePreference[] {
    if (!airlineData) return [];
    
    const airlines = this.safeArray(airlineData);
    
    return airlines.map(ap => {
      const attrs = ap.$ || {};
      const seatPref = ap.SeatPref || {};
      const seatAttrs = seatPref.$ || {};
      
      return {
        airline: attrs.VendorCode,
        level: this.mapPreferenceLevel(attrs.PreferenceLevel),
        seat: {
          position: this.mapSeatPosition(seatAttrs.SeatPosition),
          location: seatAttrs.SeatLocation,
          type: seatAttrs.SeatType
        },
        meal: ap.MealPref?.$?.MealType,
        specialService: this.safeArray(ap.SSR_Pref).map((ssr: any) => ssr.$?.SSR_Code)
      };
    });
  }

  /**
   * Parse hotel preferences
   */
  private parseHotelPreferences(hotelData: any): HotelPreference[] {
    if (!hotelData) return [];
    
    const hotels = this.safeArray(hotelData);
    
    return hotels.map(hp => {
      const attrs = hp.$ || {};
      
      return {
        chain: attrs.ChainCode,
        level: this.mapPreferenceLevel(attrs.PreferenceLevel),
        roomType: attrs.RoomType,
        smokingPreference: this.mapSmokingPreference(attrs.SmokingAllowed),
        bedType: attrs.BedType
      };
    });
  }

  /**
   * Parse car rental preferences
   */
  private parseCarPreferences(carData: any): CarPreference[] {
    if (!carData) return [];
    
    const cars = this.safeArray(carData);
    
    return cars.map(vp => {
      const attrs = vp.$ || {};
      
      return {
        vendor: attrs.VendorCode,
        level: this.mapPreferenceLevel(attrs.PreferenceLevel),
        vehicleType: attrs.VehicleType || attrs.VehType,
        transmission: this.mapTransmissionType(attrs.TransmissionType)
      };
    });
  }

  /**
   * Parse remarks
   */
  private parseRemarks(raw: any): Remark[] {
    const remarkInfo = raw.RemarkInfo || {};
    const remarks: Remark[] = [];

    // General remarks
    const generalRemarks = this.safeArray(remarkInfo.Remark);
    generalRemarks.forEach((r: any) => {
      const attrs = r.$ || {};
      remarks.push({
        type: this.mapRemarkType(attrs.Type),
        category: attrs.Category,
        text: r.Text || r._ || '',
        timestamp: attrs.TimeStamp ? new Date(attrs.TimeStamp) : undefined,
        userId: attrs.UserID
      });
    });

    // Invoice/FOP remarks
    const fopRemarks = this.safeArray(remarkInfo.FOP_Remark);
    fopRemarks.forEach((r: any) => {
      const attrs = r.$ || {};
      remarks.push({
        type: RemarkType.INVOICE,
        text: r.Text || r._ || '',
        timestamp: attrs.TimeStamp ? new Date(attrs.TimeStamp) : undefined
      });
    });

    return remarks;
  }

  /**
   * Parse employment information
   */
  private parseEmploymentInfo(traveler: any, customFields: any = {}): EmploymentInfo | undefined {
    const customer = traveler.Customer || traveler;
    const empInfo = customer.EmploymentInfo;
    
    // Even if empInfo is missing, we might have custom fields
    const emp = empInfo?.EmployeeInfo?.$ || {};
    
    const info: EmploymentInfo = {
      company: emp.Company || customFields.companycode || customFields.company_code,
      title: emp.Title,
      department: emp.Department,
      employeeId: emp.EmployeeId,
      costCenter: emp.CostCenter || customFields.cost_center || customFields.costcenter,
      division: emp.Division,
      businessUnit: emp.BusinessUnit,
      projectID: emp.ProjectID,
      hireDate: emp.HireDate ? new Date(emp.HireDate) : undefined,
      location: emp.LocationCd,
      region: emp.RegionCd
    };

    // Return undefined only if we have absolutely no data
    if (!info.company && !info.employeeId && !info.costCenter && !empInfo) {
      return undefined;
    }

    return info;
  }

  /**
   * Parse travel policy
   */
  private parseTravelPolicy(traveler: any): any {
    const customer = traveler.Customer || traveler;
    const policy = customer.TravelPolicy;
    
    if (!policy) return undefined;

    const attrs = policy.$ || {};
    
    return {
      name: attrs.CTPName || 'Unknown Policy',
      policyId: attrs.PolicyID,
      allowance: attrs.Allowance,
      restrictions: [] // Populate if structure known
    };
  }

  /**
   * Parse tax information
   */
  private parseTaxInfo(traveler: any): any[] {
    const customer = traveler.Customer || traveler;
    if (!customer.TaxInfo) return [];
    
    const taxes = this.safeArray(customer.TaxInfo);
    
    return taxes.map(t => {
      const attrs = t.$ || {};
      return {
        taxId: attrs.TaxID,
        type: attrs.TaxTypeCode,
        country: attrs.CountryCode
      };
    });
  }

  /**
   * Parse emergency contacts
   */
  private parseEmergencyContacts(traveler: any): EmergencyContact[] {
    const customer = traveler.Customer || traveler;
    if (!customer.EmergencyContactPerson) return [];
    
    const contacts = this.safeArray(customer.EmergencyContactPerson);
    
    return contacts.map(c => {
      const attrs = c.$ || {};
      const phone = c.Telephone || {};
      const address = c.Address || {};
      
      return {
        firstName: c.GivenName,
        lastName: c.SurName,
        relationship: attrs.RelationType,
        phone: phone.FullPhoneNumber || phone.$?.PhoneNumber,
        email: c.Email?.$?.EmailAddress,
        address: {
          type: address.$?.LocationTypeCode || 'Unknown',
          line1: address.AddressLine,
          city: address.CityName,
          state: address.StateCode,
          zip: address.PostalCd,
          country: address.CountryCode
        }
      };
    });
  }

  /**
   * Parse related travelers
   */
  private parseRelatedTravelers(traveler: any): RelatedTraveler[] {
    const customer = traveler.Customer || traveler;
    if (!customer.RelatedIndividual) return [];
    
    const related = this.safeArray(customer.RelatedIndividual);
    
    return related.map(r => {
      const attrs = r.$ || {};
      const phone = r.Telephone || {};
      
      return {
        firstName: r.GivenName,
        lastName: r.SurName,
        relationType: attrs.RelationType,
        phone: phone.FullPhoneNumber || phone.$?.PhoneNumber,
        email: r.Email?.$?.EmailAddress
      };
    });
  }

  // Helper methods for mapping enums

  private mapProfileType(code?: string): ProfileType {
    const mapping: Record<string, ProfileType> = {
      'TVL': ProfileType.PERSONAL,
      'AGT': ProfileType.BUSINESS,
      'CRP': ProfileType.BUSINESS,
      'GRP': ProfileType.BUSINESS
    };
    return mapping[code || ''] || ProfileType.PERSONAL;
  }

  private mapProfileStatus(code?: string): ProfileStatus {
    const mapping: Record<string, ProfileStatus> = {
      'AC': ProfileStatus.ACTIVE,
      'IN': ProfileStatus.INACTIVE,
      'DL': ProfileStatus.DELETED,
      'SU': ProfileStatus.SUSPENDED
    };
    return mapping[code || ''] || ProfileStatus.ACTIVE;
  }

  private mapGender(code?: string): Gender | undefined {
    if (!code) return undefined;
    const mapping: Record<string, Gender> = {
      'M': Gender.MALE,
      'F': Gender.FEMALE,
      'Male': Gender.MALE,
      'Female': Gender.FEMALE
    };
    return mapping[code] || Gender.UNSPECIFIED;
  }

  private mapDocumentType(code?: string): DocumentType {
    const mapping: Record<string, DocumentType> = {
      'P': DocumentType.PASSPORT,
      'V': DocumentType.VISA,
      'N': DocumentType.NATIONAL_ID,
      'D': DocumentType.DRIVERS_LICENSE,
      'K': DocumentType.KNOWN_TRAVELER_NUMBER,
      'KTN': DocumentType.KNOWN_TRAVELER_NUMBER,
      'R': DocumentType.REDRESS_NUMBER,
      'REDRESS': DocumentType.REDRESS_NUMBER
    };
    return mapping[code || ''] || DocumentType.OTHER;
  }

  private mapPreferenceLevel(level?: string): PreferenceLevel {
    const mapping: Record<string, PreferenceLevel> = {
      'Preferred': PreferenceLevel.PREFERRED,
      'Acceptable': PreferenceLevel.ACCEPTABLE,
      'Restricted': PreferenceLevel.RESTRICTED,
      'Excluded': PreferenceLevel.EXCLUDED
    };
    return mapping[level || ''] || PreferenceLevel.ACCEPTABLE;
  }

  private mapSeatPosition(position?: string): SeatPosition | undefined {
    if (!position) return undefined;
    const mapping: Record<string, SeatPosition> = {
      'Window': SeatPosition.WINDOW,
      'W': SeatPosition.WINDOW,
      'Aisle': SeatPosition.AISLE,
      'A': SeatPosition.AISLE,
      'Middle': SeatPosition.MIDDLE,
      'M': SeatPosition.MIDDLE
    };
    return mapping[position] || SeatPosition.ANY;
  }

  private mapSmokingPreference(allowed?: string): SmokingPreference {
    const mapping: Record<string, SmokingPreference> = {
      'true': SmokingPreference.SMOKING,
      'Y': SmokingPreference.SMOKING,
      'false': SmokingPreference.NON_SMOKING,
      'N': SmokingPreference.NON_SMOKING
    };
    return mapping[allowed || ''] || SmokingPreference.NO_PREFERENCE;
  }

  private mapTransmissionType(type?: string): TransmissionType {
    const mapping: Record<string, TransmissionType> = {
      'Automatic': TransmissionType.AUTOMATIC,
      'A': TransmissionType.AUTOMATIC,
      'Manual': TransmissionType.MANUAL,
      'M': TransmissionType.MANUAL
    };
    return mapping[type || ''] || TransmissionType.NO_PREFERENCE;
  }

  private mapRemarkType(type?: string): RemarkType {
    const mapping: Record<string, RemarkType> = {
      'General': RemarkType.GENERAL,
      'Invoice': RemarkType.INVOICE,
      'Itinerary': RemarkType.ITINERARY,
      'Historical': RemarkType.HISTORICAL,
      'Hidden': RemarkType.HIDDEN,
      'Corporate': RemarkType.CORPORATE,
      'Accounting': RemarkType.ACCOUNTING
    };
    return mapping[type || ''] || RemarkType.GENERAL;
  }

  /**
   * Convert item to array if not already
   */
  private safeArray(item: any): any[] {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  }
}
