
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
  TransmissionType,
  TravelPolicy,
  TaxInfo,
  ValidationResult,
  ValidationError,
  ValidationWarning
} from '../models/canonical-profile.model';

/**
 * Parser configuration options
 */
export interface ParserConfig {
  strictMode?: boolean;
  validateOutput?: boolean;
  includeRawData?: boolean;
  logErrors?: boolean;
  throwOnError?: boolean;
}

/**
 * Parse result with metadata
 */
export interface ParseResult {
  profile?: CanonicalProfile;
  errors: ParseError[];
  warnings: ParseWarning[];
  rawData?: any;
}

/**
 * Parse error
 */
export interface ParseError {
  code: string;
  message: string;
  field?: string;
  severity: 'critical' | 'error' | 'warning';
}

/**
 * Parse warning
 */
export interface ParseWarning {
  code: string;
  message: string;
  field?: string;
}

/**
 * Sabre Profile Parser
 */
export class SabreProfileParser {
  private config: Required<ParserConfig>;

  constructor(config: ParserConfig = {}) {
    this.config = {
      strictMode: false,
      validateOutput: true,
      includeRawData: false,
      logErrors: true,
      throwOnError: false,
      ...config
    };
  }

  /**
   * Parse a Sabre profile to canonical format
   * 
   * @param raw Raw Sabre profile data
   * @returns Parse result with profile and any errors/warnings
   */
  public parse(raw: any): ParseResult {
    const errors: ParseError[] = [];
    const warnings: ParseWarning[] = [];

    try {
      // Validate input
      if (!raw) {
        throw new Error('Profile data is null or undefined');
      }

      // Extract core components
      const identity = this.extractIdentity(raw);
      const traveler = raw.Traveler || {};
      const agent = raw.TravelAgent || {};
      
      // Determine profile type
      const isTraveler = !!traveler.PersonName || !!traveler.Telephone || !!traveler.Customer;

      // Build custom fields
      const customFields = {
        clientCode: identity.ClientCode,
        clientContext: identity.ClientContextCode,
        domainGroupingID: identity.DomainGroupingID,
        primaryLanguage: raw.$?.PrimaryLanguageIDCode,
        ...this.parseCustomDefinedData(raw)
      };

      // Construct canonical profile
      const profile: CanonicalProfile = {
        // Identity
        id: identity.UniqueID || '',
        profileName: identity.ProfileName,
        type: this.mapProfileType(identity.ProfileTypeCode),
        domain: identity.DomainID,
        status: this.mapProfileStatus(identity.ProfileStatusCode),
        created: raw.$?.CreateDateTime ? this.parseDate(raw.$.CreateDateTime) : undefined,
        updated: raw.$?.UpdateDateTime ? this.parseDate(raw.$.UpdateDateTime) : undefined,

        // Core Information
        personal: this.parsePersonalInfo(isTraveler ? traveler : agent, identity.ProfileName, errors),
        contact: this.parseContactInfo(traveler, errors),
        employment: this.parseEmploymentInfo(traveler, customFields, errors),

        // Relationships
        emergencyContacts: this.parseEmergencyContacts(traveler, errors),
        relatedTravelers: this.parseRelatedTravelers(traveler, errors),

        // Travel Information
        documents: this.parseTravelDocuments(traveler, errors),
        loyalty: this.parseLoyaltyPrograms(traveler, errors),
        paymentMethods: this.parsePaymentMethods(traveler, errors),
        preferences: this.parseTravelPreferences(raw, errors),
        
        // Policy & Compliance
        travelPolicy: this.parseTravelPolicy(traveler, errors),
        taxInfo: this.parseTaxInfo(traveler, errors),

        // Additional Data
        remarks: this.parseRemarks(raw, errors),
        metadata: {
          sourceGDS: GDSSource.SABRE,
          sourceId: identity.UniqueID || '',
          sourcePCC: identity.DomainID || 'Unknown',
          lastSyncDate: new Date(),
          syncVersion: '1.0.0',
          customFields: customFields
        }
      };

      // Validate if configured
      if (this.config.validateOutput) {
        const validation = this.validateProfile(profile);
        errors.push(...validation.errors.map(e => ({
          code: e.code,
          message: e.message,
          field: e.field,
          severity: 'error' as const
        })));
        warnings.push(...validation.warnings.map(w => ({
          code: w.code,
          message: w.message,
          field: w.field
        })));
      }

      return {
        profile,
        errors,
        warnings,
        rawData: this.config.includeRawData ? raw : undefined
      };

    } catch (error) {
      const parseError: ParseError = {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown parsing error',
        severity: 'critical'
      };

      errors.push(parseError);

      if (this.config.logErrors) {
        console.error('[SabreProfileParser] Parse error:', error);
      }

      if (this.config.throwOnError) {
        throw error;
      }

      return {
        errors,
        warnings,
        rawData: this.config.includeRawData ? raw : undefined
      };
    }
  }

  /**
   * Parse multiple profiles in batch
   * 
   * @param profiles Array of raw Sabre profiles
   * @returns Array of parse results
   */
  public parseBatch(profiles: any[]): ParseResult[] {
    if (!Array.isArray(profiles)) {
      throw new Error('Expected an array of profiles');
    }

    return profiles.map(profile => this.parse(profile));
  }

  /**
   * Extract identity information
   */
  private extractIdentity(raw: any): any {
    return raw.TPA_Identity?.$ || raw.TPA_Identity || {};
  }

  /**
   * Parse custom defined data from extensions
   */
  private parseCustomDefinedData(raw: any): Record<string, any> {
    const extensions = raw.Traveler?.TPA_Extensions || raw.TPA_Extensions || {};
    const customData = this.safeArray(extensions.CustomDefinedData);
    
    const result: Record<string, any> = {};
    
    customData.forEach(cd => {
      const attrs = cd.$ || {};
      const key = attrs.InformationText || attrs.CustomFieldCode;
      if (key && attrs.Value) {
        const cleanKey = key.replace(/\s+/g, '_').toLowerCase();
        result[cleanKey] = attrs.Value;
      }
    });
    
    return result;
  }

  /**
   * Parse personal information
   */
  private parsePersonalInfo(
    source: any, 
    fallbackProfileName?: string,
    errors?: ParseError[]
  ): PersonalInfo {
    try {
      const customer = source.Customer || source;
      const personName = customer.PersonName || customer.AgentName || {};
      
      let firstName = personName.GivenName || personName.$?.GivenName;
      let lastName = personName.SurName || personName.$?.SurName || personName.Surname || personName.$?.Surname;
      let middleName = personName.MiddleName || personName.$?.MiddleName;
      let title = personName.NamePrefix || personName.$?.NamePrefix;
      let suffix = personName.NameSuffix || personName.$?.NameSuffix;

      // Fallback: Parse from ProfileName if structured name is missing
      if ((!firstName || !lastName) && fallbackProfileName) {
        const parsed = this.parseProfileName(fallbackProfileName);
        if (parsed) {
          firstName = firstName || parsed.firstName;
          lastName = lastName || parsed.lastName;
          title = title || parsed.title;
        }
      }
      
      return {
        title,
        firstName,
        middleName,
        lastName,
        suffix,
        dob: customer.$?.BirthDate ? this.parseDate(customer.$.BirthDate) : undefined,
        gender: this.mapGender(customer.$?.Gender)
      };
    } catch (error) {
      errors?.push({
        code: 'PERSONAL_INFO_PARSE_ERROR',
        message: `Error parsing personal information: ${error instanceof Error ? error.message : 'Unknown error'}`,
        field: 'personal',
        severity: 'error'
      });
      
      return {
        firstName: undefined,
        lastName: undefined
      };
    }
  }

  /**
   * Parse profile name string (e.g., "SMITH/JOHN MR")
   */
  private parseProfileName(profileName: string): { firstName: string; lastName: string; title?: string } | null {
    if (!profileName) return null;
    
    try {
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
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse contact information
   */
  private parseContactInfo(traveler: any, errors?: ParseError[]): ContactInfo {
    try {
      const customer = traveler.Customer || traveler;
      
      return {
        emails: this.parseEmails(customer.Email || customer.RelatedIndividual?.Email, errors),
        phones: this.parsePhones(customer.Telephone, errors),
        addresses: this.parseAddresses(customer.Address, errors)
      };
    } catch (error) {
      errors?.push({
        code: 'CONTACT_INFO_PARSE_ERROR',
        message: `Error parsing contact information: ${error instanceof Error ? error.message : 'Unknown error'}`,
        field: 'contact',
        severity: 'error'
      });
      
      return {
        emails: [],
        phones: [],
        addresses: []
      };
    }
  }

  /**
   * Parse email addresses
   */
  private parseEmails(emailData: any, errors?: ParseError[]): EmailAddress[] {
    if (!emailData) return [];
    
    try {
      const emails = this.safeArray(emailData);
      
      return emails.map((e, index) => {
        try {
          const attrs = e.$ || {};
          return {
            type: attrs.EmailTypeCode || attrs.Type || 'Unknown',
            address: attrs.EmailAddress || e._ || '',
            primary: attrs.DefaultInd === 'true' || attrs.Primary === 'true',
            verified: false
          };
        } catch (error) {
          errors?.push({
            code: 'EMAIL_PARSE_ERROR',
            message: `Error parsing email at index ${index}`,
            field: `contact.emails[${index}]`,
            severity: 'warning'
          });
          return {
            type: 'Unknown',
            address: '',
            primary: false
          };
        }
      }).filter(e => e.address); // Remove empty emails
    } catch (error) {
      errors?.push({
        code: 'EMAILS_PARSE_ERROR',
        message: 'Error parsing emails array',
        field: 'contact.emails',
        severity: 'error'
      });
      return [];
    }
  }

  /**
   * Parse phone numbers
   */
  private parsePhones(phoneData: any, errors?: ParseError[]): PhoneNumber[] {
    if (!phoneData) return [];
    
    try {
      const phones = this.safeArray(phoneData);
      
      return phones.map((p, index) => {
        try {
          const attrs = p.$ || {};
          let number = p.FullPhoneNumber || attrs.FullPhoneNumber || '';
          
          // Construct number if split into components
          if (!number && attrs.PhoneNumber) {
            const parts: string[] = [];
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
            primary: attrs.DefaultInd === 'true',
            verified: false
          };
        } catch (error) {
          errors?.push({
            code: 'PHONE_PARSE_ERROR',
            message: `Error parsing phone at index ${index}`,
            field: `contact.phones[${index}]`,
            severity: 'warning'
          });
          return {
            type: 'Unknown',
            number: '',
            primary: false
          };
        }
      }).filter(p => p.number); // Remove empty phones
    } catch (error) {
      errors?.push({
        code: 'PHONES_PARSE_ERROR',
        message: 'Error parsing phones array',
        field: 'contact.phones',
        severity: 'error'
      });
      return [];
    }
  }

  /**
   * Parse addresses
   */
  private parseAddresses(addressData: any, errors?: ParseError[]): Address[] {
    if (!addressData) return [];
    
    try {
      const addresses = this.safeArray(addressData);
      
      return addresses.map((a, index) => {
        try {
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
            primary: attrs.DefaultInd === 'true',
            validated: false
          };
        } catch (error) {
          errors?.push({
            code: 'ADDRESS_PARSE_ERROR',
            message: `Error parsing address at index ${index}`,
            field: `contact.addresses[${index}]`,
            severity: 'warning'
          });
          return {
            type: 'Unknown'
          };
        }
      });
    } catch (error) {
      errors?.push({
        code: 'ADDRESSES_PARSE_ERROR',
        message: 'Error parsing addresses array',
        field: 'contact.addresses',
        severity: 'error'
      });
      return [];
    }
  }

  /**
   * Parse employment information
   */
  private parseEmploymentInfo(
    traveler: any,
    customFields: any = {},
    errors?: ParseError[]
  ): EmploymentInfo | undefined {
    try {
      const customer = traveler.Customer || traveler;
      const empInfo = customer.EmploymentInfo;
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
        hireDate: emp.HireDate ? this.parseDate(emp.HireDate) : undefined,
        location: emp.LocationCd,
        region: emp.RegionCd,
        manager: emp.Manager
      };

      // Return undefined if no meaningful data
      const hasData = Object.values(info).some(v => v !== undefined);
      return hasData ? info : undefined;
      
    } catch (error) {
      errors?.push({
        code: 'EMPLOYMENT_PARSE_ERROR',
        message: `Error parsing employment information: ${error instanceof Error ? error.message : 'Unknown error'}`,
        field: 'employment',
        severity: 'warning'
      });
      return undefined;
    }
  }

  /**
   * Parse travel documents
   */
  private parseTravelDocuments(traveler: any, errors?: ParseError[]): TravelDocument[] {
    const customer = traveler.Customer || traveler;
    if (!customer.Document) return [];
    
    try {
      const documents = this.safeArray(customer.Document);
      
      return documents.map((doc, index) => {
        try {
          const attrs = doc.$ || {};
          const docHolder = doc.DocHolder || {};
          
          return {
            type: this.mapDocumentType(attrs.DocTypeCode),
            number: attrs.DocID || '',
            issuingCountry: attrs.DocIssueCountryCode,
            citizenship: attrs.DocHolderNationality,
            effectiveDate: attrs.EffectiveDate ? this.parseDate(attrs.EffectiveDate) : undefined,
            expirationDate: attrs.ExpireDate ? this.parseDate(attrs.ExpireDate) : undefined,
            holderName: this.buildFullName(
              docHolder.GivenName || attrs.DocHolderGivenName,
              docHolder.SurName || attrs.DocHolderSurName
            ),
            issueLocation: attrs.DocIssueLocation,
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'DOCUMENT_PARSE_ERROR',
            message: `Error parsing document at index ${index}`,
            field: `documents[${index}]`,
            severity: 'warning'
          });
          return {
            type: DocumentType.OTHER,
            number: ''
          };
        }
      }).filter(d => d.number); // Remove invalid documents
    } catch (error) {
      errors?.push({
        code: 'DOCUMENTS_PARSE_ERROR',
        message: 'Error parsing documents array',
        field: 'documents',
        severity: 'error'
      });
      return [];
    }
  }

  /**
   * Parse loyalty programs
   */
  private parseLoyaltyPrograms(traveler: any, errors?: ParseError[]): LoyaltyProgram[] {
    const customer = traveler.Customer || traveler;
    if (!customer.CustLoyalty) return [];
    
    try {
      const loyalties = this.safeArray(customer.CustLoyalty);
      
      return loyalties.map((l, index) => {
        try {
          const attrs = l.$ || {};
          
          return {
            programName: attrs.ProgramID || attrs.VendorCode || '',
            providerType: this.mapVendorType(attrs.VendorTypeCode),
            providerName: attrs.VendorCode || '',
            number: attrs.MembershipID || '',
            tier: attrs.LoyalLevel || attrs.TierLevel,
            expirationDate: attrs.ExpireDate ? this.parseDate(attrs.ExpireDate) : undefined,
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'LOYALTY_PARSE_ERROR',
            message: `Error parsing loyalty program at index ${index}`,
            field: `loyalty[${index}]`,
            severity: 'warning'
          });
          return {
            programName: '',
            providerType: 'UNKNOWN',
            providerName: '',
            number: ''
          };
        }
      }).filter(l => l.number); // Remove invalid programs
    } catch (error) {
      errors?.push({
        code: 'LOYALTY_PARSE_ERROR',
        message: 'Error parsing loyalty programs array',
        field: 'loyalty',
        severity: 'error'
      });
      return [];
    }
  }

  /**
   * Parse payment methods
   */
  private parsePaymentMethods(traveler: any, errors?: ParseError[]): PaymentMethod[] {
    const customer = traveler.Customer || traveler;
    if (!customer.PaymentForm) return [];
    
    try {
      const payments = this.safeArray(customer.PaymentForm);
      
      return payments.map((pf, index) => {
        try {
          const card = pf.PaymentCard || {};
          const attrs = card.$ || {};
          
          return {
            type: PaymentType.CREDIT_CARD,
            cardType: attrs.CardType || attrs.CardCode,
            maskedNumber: attrs.CardNumber,
            expiration: attrs.ExpireDate,
            holderName: card.CardHolderName || attrs.CardHolderName,
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'PAYMENT_PARSE_ERROR',
            message: `Error parsing payment method at index ${index}`,
            field: `paymentMethods[${index}]`,
            severity: 'warning'
          });
          return {
            type: PaymentType.OTHER
          };
        }
      });
    } catch (error) {
      errors?.push({
        code: 'PAYMENT_PARSE_ERROR',
        message: 'Error parsing payment methods array',
        field: 'paymentMethods',
        severity: 'error'
      });
      return [];
    }
  }

  /**
   * Parse travel preferences
   */
  private parseTravelPreferences(raw: any, errors?: ParseError[]): TravelPreferences {
    try {
      const traveler = raw.Traveler || {};
      const prefCollections = traveler.PrefCollections || raw.PrefCollections || {};
      
      return {
        airlines: this.parseAirlinePreferences(prefCollections.AirlinePref, errors),
        hotels: this.parseHotelPreferences(prefCollections.HotelPref, errors),
        cars: this.parseCarPreferences(prefCollections.VehicleRentalPref, errors)
      };
    } catch (error) {
      errors?.push({
        code: 'PREFERENCES_PARSE_ERROR',
        message: 'Error parsing travel preferences',
        field: 'preferences',
        severity: 'error'
      });
      
      return {
        airlines: [],
        hotels: [],
        cars: []
      };
    }
  }

  /**
   * Parse airline preferences
   */
  private parseAirlinePreferences(airlineData: any, errors?: ParseError[]): AirlinePreference[] {
    if (!airlineData) return [];
    
    try {
      const airlines = this.safeArray(airlineData);
      
      return airlines.map((ap, index) => {
        try {
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
            specialService: this.safeArray(ap.SSR_Pref).map((ssr: any) => ssr.$?.SSR_Code).filter(Boolean)
          };
        } catch (error) {
          errors?.push({
            code: 'AIRLINE_PREF_PARSE_ERROR',
            message: `Error parsing airline preference at index ${index}`,
            field: `preferences.airlines[${index}]`,
            severity: 'warning'
          });
          return {
            level: PreferenceLevel.UNSPECIFIED
          };
        }
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse hotel preferences
   */
  private parseHotelPreferences(hotelData: any, errors?: ParseError[]): HotelPreference[] {
    if (!hotelData) return [];
    
    try {
      const hotels = this.safeArray(hotelData);
      
      return hotels.map((hp, index) => {
        try {
          const attrs = hp.$ || {};
          
          return {
            chain: attrs.ChainCode,
            level: this.mapPreferenceLevel(attrs.PreferenceLevel),
            roomType: attrs.RoomType,
            smokingPreference: this.mapSmokingPreference(attrs.SmokingAllowed),
            bedType: attrs.BedType,
            floor: attrs.Floor
          };
        } catch (error) {
          errors?.push({
            code: 'HOTEL_PREF_PARSE_ERROR',
            message: `Error parsing hotel preference at index ${index}`,
            field: `preferences.hotels[${index}]`,
            severity: 'warning'
          });
          return {
            level: PreferenceLevel.UNSPECIFIED
          };
        }
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse car rental preferences
   */
  private parseCarPreferences(carData: any, errors?: ParseError[]): CarPreference[] {
    if (!carData) return [];
    
    try {
      const cars = this.safeArray(carData);
      
      return cars.map((vp, index) => {
        try {
          const attrs = vp.$ || {};
          
          return {
            vendor: attrs.VendorCode,
            level: this.mapPreferenceLevel(attrs.PreferenceLevel),
            vehicleType: attrs.VehicleType || attrs.VehType,
            transmission: this.mapTransmissionType(attrs.TransmissionType),
            airConditioning: attrs.AirConditionInd === 'true'
          };
        } catch (error) {
          errors?.push({
            code: 'CAR_PREF_PARSE_ERROR',
            message: `Error parsing car preference at index ${index}`,
            field: `preferences.cars[${index}]`,
            severity: 'warning'
          });
          return {
            level: PreferenceLevel.UNSPECIFIED
          };
        }
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse travel policy
   */
  private parseTravelPolicy(traveler: any, errors?: ParseError[]): TravelPolicy | undefined {
    try {
      const customer = traveler.Customer || traveler;
      const policy = customer.TravelPolicy;
      
      if (!policy) return undefined;

      const attrs = policy.$ || {};
      
      return {
        name: attrs.CTPName || 'Unknown Policy',
        policyId: attrs.PolicyID,
        allowance: attrs.Allowance,
        restrictions: [],
        approvalRequired: attrs.ApprovalRequired === 'true'
      };
    } catch (error) {
      errors?.push({
        code: 'POLICY_PARSE_ERROR',
        message: 'Error parsing travel policy',
        field: 'travelPolicy',
        severity: 'warning'
      });
      return undefined;
    }
  }

  /**
   * Parse tax information
   */
  private parseTaxInfo(traveler: any, errors?: ParseError[]): TaxInfo[] {
    const customer = traveler.Customer || traveler;
    if (!customer.TaxInfo) return [];
    
    try {
      const taxes = this.safeArray(customer.TaxInfo);
      
      return taxes.map((t, index) => {
        try {
          const attrs = t.$ || {};
          return {
            taxId: attrs.TaxID,
            type: attrs.TaxTypeCode,
            country: attrs.CountryCode
          };
        } catch (error) {
          errors?.push({
            code: 'TAX_INFO_PARSE_ERROR',
            message: `Error parsing tax info at index ${index}`,
            field: `taxInfo[${index}]`,
            severity: 'warning'
          });
          return {
            taxId: ''
          };
        }
      }).filter(t => t.taxId); // Remove invalid entries
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse emergency contacts
   */
  private parseEmergencyContacts(traveler: any, errors?: ParseError[]): EmergencyContact[] {
    const customer = traveler.Customer || traveler;
    if (!customer.EmergencyContactPerson) return [];
    
    try {
      const contacts = this.safeArray(customer.EmergencyContactPerson);
      
      return contacts.map((c, index) => {
        try {
          const attrs = c.$ || {};
          const phone = c.Telephone || {};
          const address = c.Address || {};
          const addressLines = this.safeArray(address.AddressLine);
          
          return {
            firstName: c.GivenName,
            lastName: c.SurName,
            relationship: attrs.RelationType,
            phone: phone.FullPhoneNumber || phone.$?.PhoneNumber,
            email: c.Email?.$?.EmailAddress,
            address: {
              type: address.$?.LocationTypeCode || 'Unknown',
              line1: addressLines[0],
              city: address.CityName,
              state: address.StateCode,
              zip: address.PostalCd,
              country: address.CountryCode
            },
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'EMERGENCY_CONTACT_PARSE_ERROR',
            message: `Error parsing emergency contact at index ${index}`,
            field: `emergencyContacts[${index}]`,
            severity: 'warning'
          });
          return {};
        }
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse related travelers
   */
  private parseRelatedTravelers(traveler: any, errors?: ParseError[]): RelatedTraveler[] {
    const customer = traveler.Customer || traveler;
    if (!customer.RelatedIndividual) return [];
    
    try {
      const related = this.safeArray(customer.RelatedIndividual);
      
      return related.map((r, index) => {
        try {
          const attrs = r.$ || {};
          const phone = r.Telephone || {};
          
          return {
            firstName: r.GivenName,
            lastName: r.SurName,
            relationType: attrs.RelationType,
            phone: phone.FullPhoneNumber || phone.$?.PhoneNumber,
            email: r.Email?.$?.EmailAddress,
            dateOfBirth: attrs.BirthDate ? this.parseDate(attrs.BirthDate) : undefined,
            profileId: attrs.ProfileID
          };
        } catch (error) {
          errors?.push({
            code: 'RELATED_TRAVELER_PARSE_ERROR',
            message: `Error parsing related traveler at index ${index}`,
            field: `relatedTravelers[${index}]`,
            severity: 'warning'
          });
          return {};
        }
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse remarks
   */
  private parseRemarks(raw: any, errors?: ParseError[]): Remark[] {
    try {
      const remarkInfo = raw.RemarkInfo || {};
      const remarks: Remark[] = [];

      // General remarks
      const generalRemarks = this.safeArray(remarkInfo.Remark);
      generalRemarks.forEach((r: any, index: number) => {
        try {
          const attrs = r.$ || {};
          remarks.push({
            type: this.mapRemarkType(attrs.Type),
            category: attrs.Category,
            text: r.Text || r._ || '',
            timestamp: attrs.TimeStamp ? this.parseDate(attrs.TimeStamp) : undefined,
            userId: attrs.UserID,
            source: 'Sabre'
          });
        } catch (error) {
          errors?.push({
            code: 'REMARK_PARSE_ERROR',
            message: `Error parsing remark at index ${index}`,
            field: `remarks[${index}]`,
            severity: 'warning'
          });
        }
      });

      // Invoice/FOP remarks
      const fopRemarks = this.safeArray(remarkInfo.FOP_Remark);
      fopRemarks.forEach((r: any, index: number) => {
        try {
          const attrs = r.$ || {};
          remarks.push({
            type: RemarkType.INVOICE,
            text: r.Text || r._ || '',
            timestamp: attrs.TimeStamp ? this.parseDate(attrs.TimeStamp) : undefined,
            source: 'Sabre'
          });
        } catch (error) {
          errors?.push({
            code: 'FOP_REMARK_PARSE_ERROR',
            message: `Error parsing FOP remark at index ${index}`,
            field: `remarks.fop[${index}]`,
            severity: 'warning'
          });
        }
      });

      return remarks;
    } catch (error) {
      errors?.push({
        code: 'REMARKS_PARSE_ERROR',
        message: 'Error parsing remarks',
        field: 'remarks',
        severity: 'error'
      });
      return [];
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate a canonical profile
   */
  private validateProfile(profile: CanonicalProfile): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields
    if (!profile.id) {
      errors.push({
        field: 'id',
        message: 'Profile ID is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!profile.personal.firstName && !profile.personal.lastName) {
      errors.push({
        field: 'personal.name',
        message: 'At least first name or last name is required',
        code: 'REQUIRED_FIELD'
      });
    }

    // Validate emails
    profile.contact.emails.forEach((email, index) => {
      if (email.address && !this.isValidEmail(email.address)) {
        warnings.push({
          field: `contact.emails[${index}].address`,
          message: `Invalid email format: ${email.address}`,
          code: 'INVALID_FORMAT'
        });
      }
    });

    // Validate phone numbers
    profile.contact.phones.forEach((phone, index) => {
      if (phone.number && phone.number.length < 7) {
        warnings.push({
          field: `contact.phones[${index}].number`,
          message: `Phone number seems too short: ${phone.number}`,
          code: 'INVALID_FORMAT'
        });
      }
    });

    // Validate documents
    profile.documents.forEach((doc, index) => {
      if (doc.expirationDate && doc.expirationDate < new Date()) {
        warnings.push({
          field: `documents[${index}].expirationDate`,
          message: `Document ${doc.type} has expired`,
          code: 'EXPIRED_DOCUMENT'
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ============================================================================
  // MAPPING UTILITIES
  // ============================================================================

  private mapProfileType(code?: string): ProfileType {
    const mapping: Record<string, ProfileType> = {
      'TVL': ProfileType.PERSONAL,
      'AGT': ProfileType.AGENCY,
      'CRP': ProfileType.BUSINESS,
      'GRP': ProfileType.GROUP
    };
    return mapping[code || ''] || ProfileType.PERSONAL;
  }

  private mapProfileStatus(code?: string): ProfileStatus {
    const mapping: Record<string, ProfileStatus> = {
      'AC': ProfileStatus.ACTIVE,
      'IN': ProfileStatus.INACTIVE,
      'DL': ProfileStatus.DELETED,
      'SU': ProfileStatus.SUSPENDED,
      'PN': ProfileStatus.PENDING
    };
    return mapping[code || ''] || ProfileStatus.ACTIVE;
  }

  private mapGender(code?: string): Gender | undefined {
    if (!code) return undefined;
    const mapping: Record<string, Gender> = {
      'M': Gender.MALE,
      'F': Gender.FEMALE,
      'Male': Gender.MALE,
      'Female': Gender.FEMALE,
      'U': Gender.UNSPECIFIED,
      'O': Gender.OTHER
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
      'REDRESS': DocumentType.REDRESS_NUMBER,
      'OTHR': DocumentType.OTHER
    };
    return mapping[code || ''] || DocumentType.OTHER;
  }

  private mapVendorType(code?: string): string {
    const mapping: Record<string, string> = {
      'AL': 'AIRLINE',
      'HT': 'HOTEL',
      'CR': 'CAR_RENTAL',
      'RW': 'RAILWAY'
    };
    return mapping[code || ''] || 'UNKNOWN';
  }

  private mapPreferenceLevel(level?: string): PreferenceLevel {
    const mapping: Record<string, PreferenceLevel> = {
      'Preferred': PreferenceLevel.PREFERRED,
      'Acceptable': PreferenceLevel.ACCEPTABLE,
      'Restricted': PreferenceLevel.RESTRICTED,
      'Excluded': PreferenceLevel.EXCLUDED,
      'Unspecified': PreferenceLevel.UNSPECIFIED
    };
    return mapping[level || ''] || PreferenceLevel.UNSPECIFIED;
  }

  private mapSeatPosition(position?: string): SeatPosition | undefined {
    if (!position) return undefined;
    const mapping: Record<string, SeatPosition> = {
      'Window': SeatPosition.WINDOW,
      'W': SeatPosition.WINDOW,
      'Aisle': SeatPosition.AISLE,
      'A': SeatPosition.AISLE,
      'Middle': SeatPosition.MIDDLE,
      'M': SeatPosition.MIDDLE,
      'Any': SeatPosition.ANY
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

  // ============================================================================
  // HELPER UTILITIES
  // ============================================================================

  /**
   * Safely convert item to array
   */
  private safeArray(item: any): any[] {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string): Date | undefined {
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }

  /**
   * Build full name from parts
   */
  private buildFullName(firstName?: string, lastName?: string): string {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || '';
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Factory function to create parser with default config
 */
export function createSabreProfileParser(config?: ParserConfig): SabreProfileParser {
  return new SabreProfileParser(config);
}

/**
 * Convenience function to parse a single profile
 */
export function parseSabreProfile(raw: any, config?: ParserConfig): ParseResult {
  const parser = new SabreProfileParser(config);
  return parser.parse(raw);
}

/**
 * Convenience function to parse multiple profiles
 */
export function parseSabreProfiles(profiles: any[], config?: ParserConfig): ParseResult[] {
  const parser = new SabreProfileParser(config);
  return parser.parseBatch(profiles);
}