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
   */
  public parse(raw: any): ParseResult {
    const errors: ParseError[] = [];
    const warnings: ParseWarning[] = [];

    try {
      if (!raw) {
        throw new Error('Profile data is null or undefined');
      }

      const identity = this.extractIdentity(raw);
      const traveler = raw.Traveler || {};
      const customer = traveler.Customer || {};
      
      const customFields = {
        clientCode: this.safeGet(identity, 'ClientCode'),
        clientContext: this.safeGet(identity, 'ClientContextCode'),
        domainGroupingID: this.safeGet(identity, 'DomainGroupingID'),
        primaryLanguage: this.safeGet(raw.$, 'PrimaryLanguageIDCode'),
        profileNameModifyIndicator: this.safeGet(identity, 'ProfileNameModifyIndicator'),
        ...this.parseCustomDefinedData(raw)
      };

      const profile: CanonicalProfile = {
        id: this.safeGet(identity, 'UniqueID') || '',
        profileName: this.safeGet(identity, 'ProfileName'),
        type: this.mapProfileType(this.safeGet(identity, 'ProfileTypeCode')),
        domain: this.safeGet(identity, 'DomainID'),
        status: this.mapProfileStatus(this.safeGet(identity, 'ProfileStatusCode')),
        created: this.parseDateSafe(this.safeGet(raw.$, 'CreateDateTime')),
        updated: this.parseDateSafe(this.safeGet(raw.$, 'UpdateDateTime')),
        personal: this.parsePersonalInfo(customer, this.safeGet(identity, 'ProfileName'), errors),
        contact: this.parseContactInfo(customer, errors),
        employment: this.parseEmploymentInfo(customer, customFields, errors),
        emergencyContacts: this.parseEmergencyContacts(customer, errors),
        relatedTravelers: this.parseRelatedTravelers(customer, errors),
        documents: this.parseTravelDocuments(customer, errors),
        loyalty: this.parseLoyaltyPrograms(customer, errors),
        paymentMethods: this.parsePaymentMethods(customer, errors),
        preferences: this.parseTravelPreferences(traveler, errors),
        travelPolicy: this.parseTravelPolicy(customer, errors),
        taxInfo: this.parseTaxInfo(customer, errors),
        remarks: this.parseRemarks(traveler, errors),
        metadata: {
          sourceGDS: GDSSource.SABRE,
          sourceId: this.safeGet(identity, 'UniqueID') || '',
          sourcePCC: this.safeGet(identity, 'DomainID') || 'Unknown',
          lastSyncDate: new Date(),
          syncVersion: '1.0.0',
          customFields: customFields
        }
      };

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

  public parseBatch(profiles: any[]): ParseResult[] {
    if (!Array.isArray(profiles)) {
      throw new Error('Expected an array of profiles');
    }
    return profiles.map(profile => this.parse(profile));
  }

  private safeGet(obj: any, key: string | number, defaultValue: any = undefined): any {
    if (!obj || typeof obj !== 'object') return defaultValue;
    return obj[key] !== undefined && obj[key] !== null ? obj[key] : defaultValue;
  }

  private extractIdentity(raw: any): any {
    const identity = this.safeGet(raw, 'TPA_Identity', {});
    return this.safeGet(identity, '$', identity);
  }

  private parseCustomDefinedData(raw: any): Record<string, any> {
    try {
      const traveler = this.safeGet(raw, 'Traveler', {});
      const extensions = this.safeGet(traveler, 'TPA_Extensions') || this.safeGet(raw, 'TPA_Extensions', {});
      const customData = this.safeArray(this.safeGet(extensions, 'CustomDefinedData'));
      
      const result: Record<string, any> = {};
      
      customData.forEach(cd => {
        const attrs = this.safeGet(cd, '$', {});
        const key = this.safeGet(attrs, 'InformationText') || this.safeGet(attrs, 'CustomFieldCode');
        const value = this.safeGet(attrs, 'Value');
        
        if (key && value !== undefined) {
          const cleanKey = key.toString().replace(/\s+/g, '_').toLowerCase();
          result[cleanKey] = value;
        }
      });
      
      return result;
    } catch (error) {
      return {};
    }
  }

  private parsePersonalInfo(
    customer: any, 
    fallbackProfileName?: string,
    errors?: ParseError[]
  ): PersonalInfo {
    try {
      const personName = this.safeGet(customer, 'PersonName', {});
      const nameAttrs = this.safeGet(personName, '$', {});
      
      let firstName = this.safeGet(personName, 'GivenName') || this.safeGet(nameAttrs, 'GivenName');
      let lastName = this.safeGet(personName, 'SurName') || this.safeGet(nameAttrs, 'SurName') || 
                     this.safeGet(personName, 'Surname') || this.safeGet(nameAttrs, 'Surname');
      let middleName = this.safeGet(personName, 'MiddleName') || this.safeGet(nameAttrs, 'MiddleName');
      let title = this.safeGet(personName, 'NamePrefix') || this.safeGet(nameAttrs, 'NamePrefix');
      let suffix = this.safeGet(personName, 'NameSuffix') || this.safeGet(nameAttrs, 'NameSuffix');

      if ((!firstName || !lastName) && fallbackProfileName) {
        const parsed = this.parseProfileName(fallbackProfileName);
        if (parsed) {
          firstName = firstName || parsed.firstName;
          lastName = lastName || parsed.lastName;
          title = title || parsed.title;
        }
      }

      const customerAttrs = this.safeGet(customer, '$', {});
      
      return {
        title,
        firstName,
        middleName,
        lastName,
        suffix,
        dob: this.parseDateSafe(this.safeGet(customerAttrs, 'BirthDate')),
        gender: this.mapGender(this.safeGet(customerAttrs, 'Gender')),
        nationality: this.safeGet(customerAttrs, 'NationalityCode'),
        countryOfResidence: this.safeGet(customerAttrs, 'CountryOfResidence')
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

  private parseProfileName(profileName: string): { firstName: string; lastName: string; title?: string } | null {
    if (!profileName || typeof profileName !== 'string') return null;
    
    try {
      const parts = profileName.split('/');
      if (parts.length < 2) return null;

      const lastName = parts[0].trim();
      let remainder = parts[1].trim();
      let firstName = remainder;
      let title: string | undefined;

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

  private parseContactInfo(customer: any, errors?: ParseError[]): ContactInfo {
    try {
      return {
        emails: this.parseEmails(this.safeGet(customer, 'Email'), errors),
        phones: this.parsePhones(this.safeGet(customer, 'Telephone'), errors),
        addresses: this.parseAddresses(this.safeGet(customer, 'Address'), errors)
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

  private parseEmails(emailData: any, errors?: ParseError[]): EmailAddress[] {
    if (!emailData) return [];
    
    try {
      const emails = this.safeArray(emailData);
      
      return emails.map((e, index) => {
        try {
          const attrs = this.safeGet(e, '$', {});
          const address = this.safeGet(attrs, 'EmailAddress') || this.safeGet(e, '_', '');
          
          if (!address) return null;
          
          return {
            type: this.safeGet(attrs, 'EmailTypeCode') || this.safeGet(attrs, 'Type', 'Unknown'),
            address,
            primary: this.safeGet(attrs, 'DefaultInd') === 'true' || this.safeGet(attrs, 'Primary') === 'true',
            verified: false
          };
        } catch (error) {
          errors?.push({
            code: 'EMAIL_PARSE_ERROR',
            message: `Error parsing email at index ${index}`,
            field: `contact.emails[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((e) => e !== null && !!e.address) as EmailAddress[];
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

  private parsePhones(phoneData: any, errors?: ParseError[]): PhoneNumber[] {
    if (!phoneData) return [];
    
    try {
      const phones = this.safeArray(phoneData);
      
      return phones.map((p, index) => {
        try {
          const attrs = this.safeGet(p, '$', {});
          let number = this.safeGet(p, 'FullPhoneNumber') || this.safeGet(attrs, 'FullPhoneNumber', '');
          
          if (!number && this.safeGet(attrs, 'PhoneNumber')) {
            const parts: string[] = [];
            const countryCode = this.safeGet(attrs, 'CountryAccessCode');
            const areaCode = this.safeGet(attrs, 'AreaCityCode');
            const phoneNumber = this.safeGet(attrs, 'PhoneNumber');
            
            if (countryCode) parts.push(countryCode);
            if (areaCode) parts.push(areaCode);
            if (phoneNumber) parts.push(phoneNumber);
            
            number = parts.join('-');
          }

          if (!number) return null;

          return {
            type: this.safeGet(attrs, 'LocationTypeCode') || this.safeGet(attrs, 'PhoneLocationType', 'Unknown'),
            number,
            countryCode: this.safeGet(attrs, 'CountryAccessCode'),
            extension: this.safeGet(attrs, 'Extension'),
            primary: this.safeGet(attrs, 'DefaultInd') === 'true',
            verified: false
          };
        } catch (error) {
          errors?.push({
            code: 'PHONE_PARSE_ERROR',
            message: `Error parsing phone at index ${index}`,
            field: `contact.phones[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((p) => p !== null && !!p.number) as PhoneNumber[];
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

  private parseAddresses(addressData: any, errors?: ParseError[]): Address[] {
    if (!addressData) return [];
    
    try {
      const addresses = this.safeArray(addressData);
      
      return addresses.map((a, index) => {
        try {
          const attrs = this.safeGet(a, '$', {});
          const lines = this.safeArray(this.safeGet(a, 'AddressLine'));
          
          return {
            type: this.safeGet(attrs, 'LocationTypeCode') || this.safeGet(attrs, 'Type', 'Unknown'),
            line1: this.safeGet(lines, 0),
            line2: this.safeGet(lines, 1),
            line3: this.safeGet(lines, 2),
            city: this.safeGet(a, 'CityName') || this.safeGet(a, 'City'),
            state: this.safeGet(a, 'StateCode') || this.safeGet(a, 'StateProv') || this.safeGet(a, 'State'),
            zip: this.safeGet(a, 'PostalCd') || this.safeGet(a, 'PostalCode') || this.safeGet(a, 'ZIP'),
            country: this.safeGet(a, 'CountryCode') || this.safeGet(a, 'Country'),
            primary: this.safeGet(attrs, 'DefaultInd') === 'true',
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

  private parseEmploymentInfo(
    customer: any,
    customFields: any = {},
    errors?: ParseError[]
  ): EmploymentInfo | undefined {
    try {
      const empInfo = this.safeGet(customer, 'EmploymentInfo');
      if (!empInfo) return undefined;

      const employeeInfo = this.safeGet(empInfo, 'EmployeeInfo', {});
      const emp = this.safeGet(employeeInfo, '$', employeeInfo);
      
      const info: EmploymentInfo = {
        company: this.safeGet(emp, 'Company') || this.safeGet(customFields, 'companycode') || this.safeGet(customFields, 'company_code'),
        title: this.safeGet(emp, 'Title'),
        department: this.safeGet(emp, 'Department'),
        employeeId: this.safeGet(emp, 'EmployeeId'),
        costCenter: this.safeGet(emp, 'CostCenter') || this.safeGet(customFields, 'cost_center') || this.safeGet(customFields, 'costcenter'),
        division: this.safeGet(emp, 'Division'),
        businessUnit: this.safeGet(emp, 'BusinessUnit'),
        projectID: this.safeGet(emp, 'ProjectID'),
        hireDate: this.parseDateSafe(this.safeGet(emp, 'HireDate')),
        location: this.safeGet(emp, 'LocationCd'),
        region: this.safeGet(emp, 'RegionCd'),
        manager: this.safeGet(emp, 'Manager')
      };

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

  private parseTravelDocuments(customer: any, errors?: ParseError[]): TravelDocument[] {
    const documentData = this.safeGet(customer, 'Document');
    if (!documentData) return [];
    
    try {
      const documents = this.safeArray(documentData);
      
      return documents.map((doc, index) => {
        try {
          const attrs = this.safeGet(doc, '$', {});
          
          let holderName = this.safeGet(doc, 'DocHolderName');
          if (!holderName) {
            const docHolder = this.safeGet(doc, 'DocHolder', {});
            const givenName = this.safeGet(docHolder, 'GivenName') || this.safeGet(attrs, 'DocHolderGivenName');
            const surName = this.safeGet(docHolder, 'SurName') || this.safeGet(attrs, 'DocHolderSurName');
            if (givenName || surName) {
              holderName = this.buildFullName(givenName, surName);
            }
          }
          
          return {
            type: this.mapDocumentType(this.safeGet(attrs, 'DocTypeCode')),
            number: this.safeGet(attrs, 'DocID', ''),
            issuingCountry: this.safeGet(attrs, 'DocIssueCountryCode'),
            citizenship: this.safeGet(attrs, 'DocHolderNationality'),
            effectiveDate: this.parseDateSafe(this.safeGet(attrs, 'EffectiveDate')),
            expirationDate: this.parseDateSafe(this.safeGet(attrs, 'ExpireDate')),
            holderName,
            issueLocation: this.safeGet(attrs, 'DocIssueLocation'),
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'DOCUMENT_PARSE_ERROR',
            message: `Error parsing document at index ${index}`,
            field: `documents[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((d) => d !== null && !!d.number) as TravelDocument[];
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

  private parseLoyaltyPrograms(customer: any, errors?: ParseError[]): LoyaltyProgram[] {
    const loyaltyData = this.safeGet(customer, 'CustLoyalty');
    if (!loyaltyData) return [];
    
    try {
      const loyalties = this.safeArray(loyaltyData);
      
      return loyalties.map((l, index) => {
        try {
          const attrs = this.safeGet(l, '$', {});
          
          const membershipLevel = this.safeGet(l, 'MembershipLevel', {});
          const levelAttrs = this.safeGet(membershipLevel, '$', {});
          const tier = this.safeGet(levelAttrs, 'MembershipLevelTypeCode') || 
                      this.safeGet(levelAttrs, 'MembershipLevelValue') ||
                      this.safeGet(attrs, 'LoyalLevel') || 
                      this.safeGet(attrs, 'TierLevel');
          
          return {
            programName: this.safeGet(attrs, 'ProgramID') || this.safeGet(attrs, 'VendorCode', ''),
            providerType: this.mapVendorType(this.safeGet(attrs, 'VendorTypeCode')),
            providerName: this.safeGet(attrs, 'VendorCode', ''),
            number: this.safeGet(attrs, 'MembershipID', ''),
            tier,
            expirationDate: this.parseDateSafe(this.safeGet(attrs, 'ExpireDate')),
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'LOYALTY_PARSE_ERROR',
            message: `Error parsing loyalty program at index ${index}`,
            field: `loyalty[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((l) => l !== null && !!l.number) as any;
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

  private parsePaymentMethods(customer: any, errors?: ParseError[]): PaymentMethod[] {
    const paymentData = this.safeGet(customer, 'PaymentForm');
    if (!paymentData) return [];
    
    try {
      const payments = this.safeArray(paymentData);
      
      return payments.map((pf, index) => {
        try {
          const card = this.safeGet(pf, 'PaymentCard', {});
          const attrs = this.safeGet(card, '$', {});
          
          const cardHolderNameObj = this.safeGet(card, 'CardHolderName', {});
          const holderName = this.safeGet(cardHolderNameObj, 'CardHolderFullName') || 
                           this.safeGet(cardHolderNameObj, '_') ||
                           this.safeGet(attrs, 'CardHolderName');
          
          return {
            type: PaymentType.CREDIT_CARD,
            cardType: this.safeGet(attrs, 'BankCardVendorCode') || 
                     this.safeGet(attrs, 'CardType') || 
                     this.safeGet(attrs, 'CardCode'),
            maskedNumber: this.safeGet(attrs, 'MaskedCardNumber') || 
                         this.safeGet(attrs, 'CardNumber'),
            expiration: this.safeGet(attrs, 'ExpireDate'),
            holderName,
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'PAYMENT_PARSE_ERROR',
            message: `Error parsing payment method at index ${index}`,
            field: `paymentMethods[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((p) => p !== null);
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

  private parseTravelPreferences(traveler: any, errors?: ParseError[]): TravelPreferences {
    try {
      const prefCollections = this.safeGet(traveler, 'PrefCollections', {});
      
      return {
        airlines: this.parseAirlinePreferences(this.safeGet(prefCollections, 'AirlinePref'), errors),
        hotels: this.parseHotelPreferences(this.safeGet(prefCollections, 'HotelPref'), errors),
        cars: this.parseCarPreferences(this.safeGet(prefCollections, 'VehicleRentalPref'), errors)
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

  private parseAirlinePreferences(airlineData: any, errors?: ParseError[]): AirlinePreference[] {
    if (!airlineData) return [];
    
    try {
      const airlines = this.safeArray(airlineData);
      const results: AirlinePreference[] = [];
      
      airlines.forEach((ap, index) => {
        try {
          const attrs = this.safeGet(ap, '$', {});
          
          const seatPrefData = this.safeGet(ap, 'AirlineSeatPref');
          const seatPrefs = this.safeArray(seatPrefData);
          const firstSeatPref = this.safeGet(seatPrefs, 0, {});
          const seatInfo = this.safeGet(firstSeatPref, 'SeatInfo', {});
          const seatInfoAttrs = this.safeGet(seatInfo, '$', {});
          
          const mealPrefData = this.safeGet(ap, 'AirlineMealPref');
          const mealPrefs = this.safeArray(mealPrefData);
          const firstMealPref = this.safeGet(mealPrefs, 0, {});
          const mealInfo = this.safeGet(firstMealPref, 'MealInfo', {});
          const mealInfoAttrs = this.safeGet(mealInfo, '$', {});
          
          const preferredAirlinesData = this.safeGet(ap, 'PreferredAirlines');
          const preferredAirlines = this.safeArray(preferredAirlinesData);
          const firstPreferred = this.safeGet(preferredAirlines, 0, {});
          const preferredAttrs = this.safeGet(firstPreferred, '$', {});
          
          const ssrPrefData = this.safeGet(ap, 'SSR_Pref');
          const ssrPrefs = this.safeArray(ssrPrefData);
          const specialServices = ssrPrefs
            .map((ssr: any) => this.safeGet(this.safeGet(ssr, '$', {}), 'SSR_Code'))
            .filter((code: any) => code);
          
          const pref: AirlinePreference = {
            airline: this.safeGet(preferredAttrs, 'VendorCode') || this.safeGet(attrs, 'VendorCode'),
            level: this.mapPreferenceLevel(
              this.safeGet(preferredAttrs, 'PreferLevelCode') || 
              this.safeGet(attrs, 'PreferLevelCode') ||
              this.safeGet(attrs, 'PreferenceLevel')
            ),
            seat: {
              position: this.mapSeatPosition(this.safeGet(seatInfoAttrs, 'SeatPreferenceCode')),
              location: this.safeGet(seatInfoAttrs, 'SeatLocation'),
              type: this.safeGet(seatInfoAttrs, 'SeatType')
            },
            meal: this.safeGet(mealInfoAttrs, 'MealTypeCode'),
            specialService: specialServices
          };
          
          results.push(pref);
        } catch (error) {
          errors?.push({
            code: 'AIRLINE_PREF_PARSE_ERROR',
            message: `Error parsing airline preference at index ${index}`,
            field: `preferences.airlines[${index}]`,
            severity: 'warning'
          });
        }
      });
      
      return results;
    } catch (error) {
      return [];
    }
  }

  private parseHotelPreferences(hotelData: any, errors?: ParseError[]): HotelPreference[] {
    if (!hotelData) return [];
    
    try {
      const hotels = this.safeArray(hotelData);
      const results: HotelPreference[] = [];
      
      hotels.forEach((hp, index) => {
        try {
          const attrs = this.safeGet(hp, '$', {});
          
          const preferredHotelData = this.safeGet(hp, 'PreferredHotel');
          const preferredHotels = this.safeArray(preferredHotelData);
          const firstPreferred = this.safeGet(preferredHotels, 0, {});
          const preferredAttrs = this.safeGet(firstPreferred, '$', {});
          
          const hotelRate = this.safeGet(firstPreferred, 'HotelRate', {});
          const rateAttrs = this.safeGet(hotelRate, '$', {});
          
          const pref: HotelPreference = {
            chain: this.safeGet(preferredAttrs, 'HotelVendorCode') || 
                  this.safeGet(attrs, 'ChainCode') || 
                  this.safeGet(attrs, 'VendorCode'),
            level: this.mapPreferenceLevel(
              this.safeGet(preferredAttrs, 'PreferLevelCode') ||
              this.safeGet(attrs, 'PreferenceLevel')
            ),
            roomType: this.safeGet(attrs, 'RoomType'),
            smokingPreference: this.mapSmokingPreference(this.safeGet(attrs, 'SmokingAllowed')),
            bedType: this.safeGet(attrs, 'BedType'),
            floor: this.safeGet(attrs, 'Floor'),
            maxRate: this.safeGet(rateAttrs, 'MaxRoomRate'),
            currency: this.safeGet(rateAttrs, 'CurrencyCode')
          };
          
          results.push(pref);
        } catch (error) {
          errors?.push({
            code: 'HOTEL_PREF_PARSE_ERROR',
            message: `Error parsing hotel preference at index ${index}`,
            field: `preferences.hotels[${index}]`,
            severity: 'warning'
          });
        }
      });
      
      return results;
    } catch (error) {
      return [];
    }
  }

  private parseCarPreferences(carData: any, errors?: ParseError[]): CarPreference[] {
    if (!carData) return [];
    
    try {
      const cars = this.safeArray(carData);
      const results: CarPreference[] = [];
      
      cars.forEach((vp, index) => {
        try {
          const attrs = this.safeGet(vp, '$', {});
          
          const preferredVendorsData = this.safeGet(vp, 'PreferredVehicleVendors');
          const preferredVendors = this.safeArray(preferredVendorsData);
          const firstVendor = this.safeGet(preferredVendors, 0, {});
          const vendorAttrs = this.safeGet(firstVendor, '$', {});
          
          const vehicleRate = this.safeGet(firstVendor, 'VehicleRate', {});
          const rateAttrs = this.safeGet(vehicleRate, '$', {});
          
          const pref: CarPreference = {
            vendor: this.safeGet(vendorAttrs, 'VendorCode') || this.safeGet(attrs, 'VendorCode'),
            level: this.mapPreferenceLevel(
              this.safeGet(vendorAttrs, 'PreferLevelCode') ||
              this.safeGet(attrs, 'PreferenceLevel')
            ),
            vehicleType: this.safeGet(vendorAttrs, 'VehicleTypeCode') || 
                        this.safeGet(attrs, 'VehicleType') || 
                        this.safeGet(attrs, 'VehType'),
            transmission: this.mapTransmissionType(this.safeGet(attrs, 'TransmissionType')),
            airConditioning: this.safeGet(attrs, 'AirConditionInd') === 'true',
            maxRate: this.safeGet(rateAttrs, 'MaxRateAmount'),
            currency: this.safeGet(rateAttrs, 'CurrencyCode')
          };
          
          results.push(pref);
        } catch (error) {
          errors?.push({
            code: 'CAR_PREF_PARSE_ERROR',
            message: `Error parsing car preference at index ${index}`,
            field: `preferences.cars[${index}]`,
            severity: 'warning'
          });
        }
      });
      
      return results;
    } catch (error) {
      return [];
    }
  }

  private parseTravelPolicy(customer: any, errors?: ParseError[]): TravelPolicy | undefined {
    try {
      const policy = this.safeGet(customer, 'TravelPolicy');
      if (!policy) return undefined;

      const attrs = this.safeGet(policy, '$', {});
      
      return {
        name: this.safeGet(attrs, 'CTPName', 'Unknown Policy'),
        policyId: this.safeGet(attrs, 'PolicyID'),
        allowance: this.safeGet(attrs, 'Allowance'),
        restrictions: [],
        approvalRequired: this.safeGet(attrs, 'ApprovalRequired') === 'true'
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

  private parseTaxInfo(customer: any, errors?: ParseError[]): TaxInfo[] {
    const taxData = this.safeGet(customer, 'TaxInfo');
    if (!taxData) return [];
    
    try {
      const taxes = this.safeArray(taxData);
      
      return taxes.map((t, index) => {
        try {
          const attrs = this.safeGet(t, '$', {});
          return {
            taxId: this.safeGet(attrs, 'TaxID', ''),
            type: this.safeGet(attrs, 'TaxTypeCode'),
            country: this.safeGet(attrs, 'CountryCode')
          };
        } catch (error) {
          errors?.push({
            code: 'TAX_INFO_PARSE_ERROR',
            message: `Error parsing tax info at index ${index}`,
            field: `taxInfo[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((t) => t !== null && !!t.taxId) as any;
    } catch (error) {
      return [];
    }
  }

  private parseEmergencyContacts(customer: any, errors?: ParseError[]): EmergencyContact[] {
    const contactData = this.safeGet(customer, 'EmergencyContactPerson');
    if (!contactData) return [];
    
    try {
      const contacts = this.safeArray(contactData);
      
      return contacts.map((c, index) => {
        try {
          const attrs = this.safeGet(c, '$', {});
          
          const telephone = this.safeGet(c, 'Telephone', {});
          const telephoneAttrs = this.safeGet(telephone, '$', {});
          const phone = this.safeGet(telephone, 'FullPhoneNumber') || this.safeGet(telephoneAttrs, 'PhoneNumber');
          
          const email = this.safeGet(c, 'Email', {});
          const emailAttrs = this.safeGet(email, '$', {});
          const emailAddress = this.safeGet(emailAttrs, 'EmailAddress');
          
          const address = this.safeGet(c, 'Address', {});
          const addressAttrs = this.safeGet(address, '$', {});
          const addressLines = this.safeArray(this.safeGet(address, 'AddressLine'));
          
          return {
            firstName: this.safeGet(c, 'GivenName'),
            lastName: this.safeGet(c, 'SurName'),
            title: this.safeGet(c, 'NamePrefix'),
            suffix: this.safeGet(c, 'NameSuffix'),
            relationship: this.safeGet(attrs, 'RelationType') || this.safeGet(attrs, 'RelationTypeCode'),
            phone,
            email: emailAddress,
            address: {
              type: this.safeGet(addressAttrs, 'LocationTypeCode', 'Unknown'),
              line1: this.safeGet(addressLines, 0),
              line2: this.safeGet(addressLines, 1),
              city: this.safeGet(address, 'CityName'),
              state: this.safeGet(address, 'StateCode'),
              zip: this.safeGet(address, 'PostalCd'),
              country: this.safeGet(address, 'CountryCode')
            },
            dateOfBirth: this.parseDateSafe(this.safeGet(attrs, 'BirthDate')),
            primary: index === 0
          };
        } catch (error) {
          errors?.push({
            code: 'EMERGENCY_CONTACT_PARSE_ERROR',
            message: `Error parsing emergency contact at index ${index}`,
            field: `emergencyContacts[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((c)=> c !== null);
    } catch (error) {
      return [];
    }
  }

  private parseRelatedTravelers(customer: any, errors?: ParseError[]): RelatedTraveler[] {
    const relatedData = this.safeGet(customer, 'RelatedIndividual');
    if (!relatedData) return [];
    
    try {
      const related = this.safeArray(relatedData);
      
      return related.map((r, index) => {
        try {
          const attrs = this.safeGet(r, '$', {});
          
          const telephone = this.safeGet(r, 'Telephone', {});
          const telephoneAttrs = this.safeGet(telephone, '$', {});
          const phone = this.safeGet(telephone, 'FullPhoneNumber') || this.safeGet(telephoneAttrs, 'PhoneNumber');
          
          const email = this.safeGet(r, 'Email', {});
          const emailAttrs = this.safeGet(email, '$', {});
          const emailAddress = this.safeGet(emailAttrs, 'EmailAddress');
          
          return {
            firstName: this.safeGet(r, 'GivenName'),
            lastName: this.safeGet(r, 'SurName'),
            relationType: this.safeGet(attrs, 'RelationType'),
            phone,
            email: emailAddress,
            dateOfBirth: this.parseDateSafe(this.safeGet(attrs, 'BirthDate')),
            profileId: this.safeGet(attrs, 'ProfileID')
          };
        } catch (error) {
          errors?.push({
            code: 'RELATED_TRAVELER_PARSE_ERROR',
            message: `Error parsing related traveler at index ${index}`,
            field: `relatedTravelers[${index}]`,
            severity: 'warning'
          });
          return null;
        }
      }).filter((r) => r !== null);
    } catch (error) {
      return [];
    }
  }

  private parseRemarks(traveler: any, errors?: ParseError[]): Remark[] {
    const remarks: Remark[] = [];

    try {
      const tpaExtensions = this.safeGet(traveler, 'TPA_Extensions', {});
      const priorityRemarks = this.safeArray(this.safeGet(tpaExtensions, 'PriorityRemarks'));
      
      priorityRemarks.forEach((r: any, index: number) => {
        try {
          const attrs = this.safeGet(r, '$', {});
          const text = this.safeGet(attrs, 'Text') || this.safeGet(r, '_', '');
          
          if (text) {
            remarks.push({
              type: RemarkType.PRIORITY,
              text,
              timestamp: this.parseDateSafe(this.safeGet(attrs, 'TimeStamp')),
              userId: this.safeGet(attrs, 'UserID'),
              source: 'Sabre'
            });
          }
        } catch (error) {
          errors?.push({
            code: 'PRIORITY_REMARK_PARSE_ERROR',
            message: `Error parsing priority remark at index ${index}`,
            field: `remarks.priority[${index}]`,
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

  private validateProfile(profile: CanonicalProfile): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!profile.id) {
      errors.push({
        field: 'id',
        message: 'Profile ID is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!profile.personal.firstName && !profile.personal.lastName) {
      warnings.push({
        field: 'personal.name',
        message: 'At least first name or last name is recommended',
        code: 'RECOMMENDED_FIELD'
      });
    }

    profile.contact.emails.forEach((email, index) => {
      if (email.address && !this.isValidEmail(email.address)) {
        warnings.push({
          field: `contact.emails[${index}].address`,
          message: `Invalid email format: ${email.address}`,
          code: 'INVALID_FORMAT'
        });
      }
    });

    profile.contact.phones.forEach((phone, index) => {
      if (phone.number && phone.number.length < 7) {
        warnings.push({
          field: `contact.phones[${index}].number`,
          message: `Phone number seems too short: ${phone.number}`,
          code: 'INVALID_FORMAT'
        });
      }
    });

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

  private mapProfileType(code?: string): ProfileType {
    if (!code) return ProfileType.PERSONAL;
    const mapping: Record<string, ProfileType> = {
      'TVL': ProfileType.PERSONAL,
      'AGT': ProfileType.AGENCY,
      'CRP': ProfileType.BUSINESS,
      'GRP': ProfileType.GROUP
    };
    return mapping[code] || ProfileType.PERSONAL;
  }

  private mapProfileStatus(code?: string): ProfileStatus {
    if (!code) return ProfileStatus.ACTIVE;
    const mapping: Record<string, ProfileStatus> = {
      'AC': ProfileStatus.ACTIVE,
      'IN': ProfileStatus.INACTIVE,
      'DL': ProfileStatus.DELETED,
      'SU': ProfileStatus.SUSPENDED,
      'PN': ProfileStatus.PENDING
    };
    return mapping[code] || ProfileStatus.ACTIVE;
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
    if (!code) return DocumentType.OTHER;
    
    const normalizedCode = code.toUpperCase();
    
    const mapping: Record<string, DocumentType> = {
      'P': DocumentType.PASSPORT,
      'PSPT': DocumentType.PASSPORT,
      'PASSPORT': DocumentType.PASSPORT,
      'V': DocumentType.VISA,
      'VISA': DocumentType.VISA,
      'N': DocumentType.NATIONAL_ID,
      'NID': DocumentType.NATIONAL_ID,
      'NATIONAL_ID': DocumentType.NATIONAL_ID,
      'D': DocumentType.DRIVERS_LICENSE,
      'DL': DocumentType.DRIVERS_LICENSE,
      'DRIVERS_LICENSE': DocumentType.DRIVERS_LICENSE,
      'K': DocumentType.KNOWN_TRAVELER_NUMBER,
      'KTN': DocumentType.KNOWN_TRAVELER_NUMBER,
      'KNOWN_TRAVELER': DocumentType.KNOWN_TRAVELER_NUMBER,
      'R': DocumentType.REDRESS_NUMBER,
      'REDRESS': DocumentType.REDRESS_NUMBER,
      'REDRESS_NUMBER': DocumentType.REDRESS_NUMBER,
      'OTHR': DocumentType.OTHER,
      'OTHER': DocumentType.OTHER
    };
    return mapping[normalizedCode] || DocumentType.OTHER;
  }

  private mapVendorType(code?: string): string {
    if (!code) return 'UNKNOWN';
    const mapping: Record<string, string> = {
      'AL': 'AIRLINE',
      'HT': 'HOTEL',
      'CR': 'CAR_RENTAL',
      'RW': 'RAILWAY'
    };
    return mapping[code] || 'UNKNOWN';
  }

  private mapPreferenceLevel(level?: string): PreferenceLevel {
    if (!level) return PreferenceLevel.UNSPECIFIED;
    
    const normalizedLevel = level.toUpperCase();
    const mapping: Record<string, PreferenceLevel> = {
      'P': PreferenceLevel.PREFERRED,
      'PREFERRED': PreferenceLevel.PREFERRED,
      'A': PreferenceLevel.ACCEPTABLE,
      'ACCEPTABLE': PreferenceLevel.ACCEPTABLE,
      'R': PreferenceLevel.RESTRICTED,
      'RESTRICTED': PreferenceLevel.RESTRICTED,
      'E': PreferenceLevel.EXCLUDED,
      'EXCLUDED': PreferenceLevel.EXCLUDED,
      'U': PreferenceLevel.UNSPECIFIED,
      'UNSPECIFIED': PreferenceLevel.UNSPECIFIED
    };
    return mapping[normalizedLevel] || PreferenceLevel.UNSPECIFIED;
  }

  private mapSeatPosition(position?: string): SeatPosition | undefined {
    if (!position) return undefined;
    
    const normalizedPosition = position.toUpperCase();
    const mapping: Record<string, SeatPosition> = {
      'WINDOW': SeatPosition.WINDOW,
      'W': SeatPosition.WINDOW,
      'ASLE': SeatPosition.AISLE,
      'AISLE': SeatPosition.AISLE,
      'A': SeatPosition.AISLE,
      'MIDDLE': SeatPosition.MIDDLE,
      'M': SeatPosition.MIDDLE,
      'ANY': SeatPosition.ANY
    };
    return mapping[normalizedPosition] || SeatPosition.ANY;
  }

  private mapSmokingPreference(allowed?: string): SmokingPreference {
    if (!allowed) return SmokingPreference.NO_PREFERENCE;
    
    const normalizedAllowed = allowed.toLowerCase();
    const mapping: Record<string, SmokingPreference> = {
      'true': SmokingPreference.SMOKING,
      'y': SmokingPreference.SMOKING,
      'yes': SmokingPreference.SMOKING,
      'false': SmokingPreference.NON_SMOKING,
      'n': SmokingPreference.NON_SMOKING,
      'no': SmokingPreference.NON_SMOKING
    };
    return mapping[normalizedAllowed] || SmokingPreference.NO_PREFERENCE;
  }

  private mapTransmissionType(type?: string): TransmissionType {
    if (!type) return TransmissionType.NO_PREFERENCE;
    
    const normalizedType = type.toUpperCase();
    const mapping: Record<string, TransmissionType> = {
      'AUTOMATIC': TransmissionType.AUTOMATIC,
      'A': TransmissionType.AUTOMATIC,
      'AUTO': TransmissionType.AUTOMATIC,
      'MANUAL': TransmissionType.MANUAL,
      'M': TransmissionType.MANUAL,
      'MAN': TransmissionType.MANUAL
    };
    return mapping[normalizedType] || TransmissionType.NO_PREFERENCE;
  }

  private safeArray(item: any): any[] {
    if (!item) return [];
    return Array.isArray(item) ? item : [item];
  }

  private parseDateSafe(dateStr: any): Date | undefined {
    if (!dateStr || typeof dateStr !== 'string') return undefined;
    
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }

  private buildFullName(firstName?: string, lastName?: string): string {
    const parts = [firstName, lastName].filter(part => part && typeof part === 'string');
    return parts.join(' ').trim() || '';
  }

  private isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export function createSabreProfileParser(config?: ParserConfig): SabreProfileParser {
  return new SabreProfileParser(config);
}

export function parseSabreProfile(raw: any, config?: ParserConfig): ParseResult {
  const parser = new SabreProfileParser(config);
  return parser.parse(raw);
}

export function parseSabreProfiles(profiles: any[], config?: ParserConfig): ParseResult[] {
  const parser = new SabreProfileParser(config);
  return parser.parseBatch(profiles);
}