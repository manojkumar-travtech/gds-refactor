import {
  CanonicalProfile,
  ProfileType,
  ProfileStatus,
  PersonalInfo,
  EmailAddress,
  PhoneNumber,
  Address,
  EmploymentInfo,
  TravelDocument,
  DocumentType,
  LoyaltyProgram,
  PaymentMethod,
  PaymentType,
  TravelPreferences,
  PreferenceLevel,
  Remark,
  RemarkType,
  Gender,
  SeatPosition,
  SmokingPreference,
  TransmissionType
} from '../models/canonical-profile.model';

/**
 * Builder for converting Canonical Profile data to Sabre XML format
 * Used for Create and Update operations
 */
export class SabreProfileBuilder {
  
  /**
   * Build a Sabre_OTA_ProfileCreateRQ body
   */
  buildCreateRequest(profile: CanonicalProfile): any {
    return {
      'Sabre_OTA_ProfileCreateRQ': {
        '$': {
          'Version': '6.99.2',
          'xmlns': 'http://www.sabre.com/eps/schemas'
        },
        'Profile': this.buildProfileContent(profile)
      }
    };
  }

  /**
   * Build a Sabre_OTA_ProfileUpdateRQ body
   * Uses "Full Overlay" strategy by default (sending all data)
   */
  buildUpdateRequest(profile: CanonicalProfile): any {
    return {
      'Sabre_OTA_ProfileUpdateRQ': {
        '$': {
          'Version': '6.99.2',
          'xmlns': 'http://www.sabre.com/eps/schemas'
        },
        'ProfileInfo': {
          'Profile': this.buildProfileContent(profile)
        }
      }
    };
  }

  /**
   * Build a Sabre_OTA_ProfileDeleteRQ body
   */
  buildDeleteRequest(profileId: string, domainId: string, clientCode: string = 'TN', clientContext: string = 'TMP'): any {
    return {
      'Sabre_OTA_ProfileDeleteRQ': {
        '$': {
          'Version': '6.99.2',
          'xmlns': 'http://www.sabre.com/eps/schemas'
        },
        'Delete': {
          'Profile': {
            '$': {
              'PurgeDays': '0'
            },
            'TPA_Identity': {
              '$': {
                'UniqueID': profileId,
                'DomainID': domainId,
                'ClientCode': clientCode,
                'ClientContextCode': clientContext,
                'ProfileTypeCode': 'TVL'
              }
            }
          }
        }
      }
    };
  }

  /**
   * Construct the common Profile element content
   */
  private buildProfileContent(profile: CanonicalProfile): any {
    const now = new Date().toISOString();
    // For updates, we must provide the LAST UpdateDateTime from the server to satisfy optimistic locking.
    // If profile.updated is present, use it. Otherwise use now (for creation).
    const updateTime = profile.updated ? profile.updated.toISOString() : now;

    const content: any = {
      '$': {
        'CreateDateTime': profile.created ? profile.created.toISOString() : now,
        'UpdateDateTime': updateTime
      },
      'TPA_Identity': this.buildIdentity(profile)
    };

    // Add Traveler or TravelAgent based on type
    // For now, we primarily support Traveler profiles as per PRD focus
    if (profile.type === ProfileType.PERSONAL || profile.type === ProfileType.BUSINESS) {
      content['Traveler'] = this.buildTraveler(profile);
    } else {
      // Fallback or Agent logic could go here
      content['Traveler'] = this.buildTraveler(profile);
    }

    // RemarkInfo is a sibling of Traveler, not a child
    if (profile.remarks && profile.remarks.length > 0) {
      content['RemarkInfo'] = this.buildRemarks(profile.remarks);
    }

    return content;
  }

  private buildIdentity(profile: CanonicalProfile): any {
    return {
      '$': {
        'ClientCode': profile.metadata.customFields?.clientCode || 'TN',
        'ClientContextCode': profile.metadata.customFields?.clientContext || 'TMP',
        'DomainID': profile.domain || profile.metadata.sourcePCC,
        'ProfileName': profile.profileName || this.generateProfileName(profile),
        'ProfileStatusCode': this.mapProfileStatus(profile.status),
        'ProfileTypeCode': this.mapProfileType(profile.type),
        'UniqueID': profile.id || '*'
      }
    };
  }

  private generateProfileName(profile: CanonicalProfile): string {
    // Format: LASTNAME/FIRSTNAME
    const last = profile.personal.lastName || 'UNKNOWN';
    const first = profile.personal.firstName || 'UNKNOWN';
    return `${last}/${first}`.toUpperCase();
  }

  private buildTraveler(profile: CanonicalProfile): any {
    const traveler: any = {
      'Customer': {
        'PersonName': this.buildPersonName(profile.personal),
        'Telephone': this.buildPhones(profile.contact.phones),
        'Email': this.buildEmails(profile.contact.emails),
        'Address': this.buildAddresses(profile.contact.addresses),
        'CustLoyalty': this.buildLoyalty(profile.loyalty),
        'PaymentForm': this.buildPaymentMethods(profile.paymentMethods),
        'Document': this.buildDocuments(profile.documents)
      },
      'PrefCollections': this.buildPreferences(profile.preferences)
    };

    if (profile.employment) {
      traveler['Customer']['EmploymentInfo'] = this.buildEmployment(profile.employment);
    }

    if (profile.personal.dob) {
      traveler['Customer']['$'] = {
        'BirthDate': profile.personal.dob.toISOString().split('T')[0],
        'GenderCode': this.mapGender(profile.personal.gender) // Changed from Gender to GenderCode
      };
    }

    return traveler;
  }

  private buildPersonName(personal: PersonalInfo): any {
    const name: any = {};

    if (personal.title) name['NamePrefix'] = personal.title;
    if (personal.firstName) name['GivenName'] = personal.firstName;
    if (personal.middleName) name['MiddleName'] = personal.middleName;
    if (personal.lastName) name['SurName'] = personal.lastName;
    if (personal.suffix) name['NameSuffix'] = personal.suffix;

    return name;
  }

  private buildPhones(phones: PhoneNumber[]): any[] {
    return phones.map(p => ({
      // Attributes not allowed on Telephone in this version?
      // Using FullPhoneNumber as child
      'FullPhoneNumber': p.number
    }));
  }

  private buildEmails(emails: EmailAddress[]): any[] {
    return emails.map(e => ({
      '$': {
        'EmailTypeCode': this.mapEmailType(e.type),
        'EmailAddress': e.address
        // DefaultInd removed as it caused error
      }
    }));
  }

  private buildAddresses(addresses: Address[]): any[] {
    return addresses.map(a => ({
      '$': {
        'LocationTypeCode': this.mapAddressType(a.type),
        'DefaultInd': a.primary ? 'true' : 'false'
      },
      'AddressLine': [a.line1, a.line2, a.line3].filter(Boolean),
      'CityName': a.city,
      'StateProv': { '$': { 'StateCode': a.state } },
      'PostalCode': a.zip,
      'CountryName': { '$': { 'Code': a.country } }
    }));
  }

  private buildEmployment(emp: EmploymentInfo): any {
    return {
      'EmployeeInfo': {
        '$': {
          'Company': emp.company,
          'Title': emp.title,
          'Department': emp.department,
          'EmployeeId': emp.employeeId,
          'CostCenter': emp.costCenter,
          'Division': emp.division,
          'BusinessUnit': emp.businessUnit,
          'ProjectID': emp.projectID,
          'HireDate': emp.hireDate ? emp.hireDate.toISOString().split('T')[0] : undefined,
          'LocationCd': emp.location
        }
      }
    };
  }

  private buildDocuments(docs: TravelDocument[]): any[] {
    return docs.map(d => ({
      '$': {
        'DocTypeCode': this.mapDocumentType(d.type),
        'DocID': d.number,
        'DocIssueCountryCode': d.issuingCountry,
        'DocHolderNationality': d.citizenship,
        'EffectiveDate': d.issueDate ? d.issueDate.toISOString().split('T')[0] : undefined,
        'ExpireDate': d.expirationDate ? d.expirationDate.toISOString().split('T')[0] : undefined,
        'DocHolderGivenName': d.holderName ? d.holderName.split(' ')[0] : undefined,
        'DocHolderSurName': d.holderName ? d.holderName.split(' ').slice(1).join(' ') : undefined
      }
    }));
  }

  private buildLoyalty(programs: LoyaltyProgram[]): any[] {
    return programs.map(p => ({
      '$': {
        'ProgramID': p.programName,
        'MembershipID': p.number,
        'LoyalLevel': p.tier,
        'VendorCode': p.providerName,
        'ExpireDate': p.expirationDate ? p.expirationDate.toISOString().split('T')[0] : undefined
      }
    }));
  }

  private buildPaymentMethods(payments: PaymentMethod[]): any[] {
    return payments
      .filter(p => p.type === PaymentType.CREDIT_CARD)
      .map(p => ({
        'PaymentCard': {
          '$': {
            'CardType': p.cardType,
            'CardNumber': p.maskedNumber, // Note: In real scenario, this should be token or full number if PCI compliant
            'ExpireDate': this.formatExpirationDate(p.expirationMonth, p.expirationYear),
            'CardHolderName': p.holderName
          }
        }
      }));
  }

  private buildPreferences(prefs: TravelPreferences): any {
    return {
      'AirlinePref': prefs.airlines.map(a => ({
        '$': {
          'VendorCode': a.airline,
          'PreferenceLevel': this.mapPreferenceLevel(a.level)
        },
        'SeatPref': a.seat ? {
          '$': {
            'SeatPosition': this.mapSeatPosition(a.seat.position),
            'SeatLocation': a.seat.location,
            'SeatType': a.seat.type
          }
        } : undefined,
        'MealPref': a.meal ? { '$': { 'MealType': a.meal } } : undefined,
        'SSR_Pref': (a.specialService || []).map(ssr => ({ '$': { 'SSR_Code': ssr } }))
      })),
      'HotelPref': prefs.hotels.map(h => ({
        '$': {
          'ChainCode': h.chain,
          'PreferenceLevel': this.mapPreferenceLevel(h.level),
          'RoomType': h.roomType,
          'SmokingAllowed': h.smokingPreference ? this.mapSmokingPreference(h.smokingPreference) : undefined,
          'BedType': h.bedType
        }
      })),
      'VehicleRentalPref': prefs.cars.map(c => ({
        '$': {
          'VendorCode': c.vendor,
          'PreferenceLevel': this.mapPreferenceLevel(c.level),
          'VehicleType': c.vehicleType,
          'TransmissionType': c.transmission ? this.mapTransmissionType(c.transmission) : undefined
        }
      }))
    };
  }

  private buildRemarks(remarks: Remark[]): any {
    const result: any = {};
    
    const generalRemarks = remarks.filter(r => r.type !== RemarkType.INVOICE);
    if (generalRemarks.length > 0) {
      result['Remark'] = generalRemarks.map(r => ({
        '_': r.text,
        '$': {
          'Type': this.mapRemarkType(r.type),
          'Category': r.category
        }
      }));
    }

    const invoiceRemarks = remarks.filter(r => r.type === RemarkType.INVOICE);
    if (invoiceRemarks.length > 0) {
      result['FOP_Remark'] = invoiceRemarks.map(r => ({
        '_': r.text
      }));
    }

    return result;
  }

  // Mappers

  private mapProfileType(type: ProfileType): string {
    const mapping: Record<string, string> = {
      [ProfileType.PERSONAL]: 'TVL',
      [ProfileType.BUSINESS]: 'AGT' // Or CRP depending on context
    };
    return mapping[type] || 'TVL';
  }

  private mapProfileStatus(status: ProfileStatus): string {
    const mapping: Record<string, string> = {
      [ProfileStatus.ACTIVE]: 'AC',
      [ProfileStatus.INACTIVE]: 'IN',
      [ProfileStatus.DELETED]: 'DL',
      [ProfileStatus.SUSPENDED]: 'SU'
    };
    return mapping[status] || 'AC';
  }

  private mapGender(gender?: Gender): string | undefined {
    if (!gender) return undefined;
    const mapping: Record<string, string> = {
      [Gender.MALE]: 'M',
      [Gender.FEMALE]: 'F',
      [Gender.UNSPECIFIED]: 'U'
    };
    return mapping[gender];
  }

  /*
  private mapPhoneType(type: string): string {
    // Simplified mapping
    if (type.toUpperCase().includes('MOBILE') || type.toUpperCase().includes('CELL')) return 'M';
    if (type.toUpperCase().includes('HOME')) return 'H';
    if (type.toUpperCase().includes('WORK') || type.toUpperCase().includes('BUS')) return 'B';
    return 'H'; // Default
  }
  */

  private mapEmailType(type: string): string {
    const t = type.toUpperCase();
    if (t.includes('HOME') || t.includes('PERS')) return 'HOM';
    return 'BUS'; // Default to BUS as OTH is not always supported
  }

  private mapAddressType(type: string): string {
    if (type.toUpperCase().includes('HOME')) return 'H';
    if (type.toUpperCase().includes('WORK') || type.toUpperCase().includes('BUS')) return 'B';
    return 'H';
  }

  private mapDocumentType(type: DocumentType): string {
    const mapping: Record<string, string> = {
      [DocumentType.PASSPORT]: 'P',
      [DocumentType.VISA]: 'V',
      [DocumentType.NATIONAL_ID]: 'N',
      [DocumentType.DRIVERS_LICENSE]: 'D',
      [DocumentType.KNOWN_TRAVELER_NUMBER]: 'KTN',
      [DocumentType.REDRESS_NUMBER]: 'REDRESS'
    };
    return mapping[type] || 'O';
  }

  private mapPreferenceLevel(level: PreferenceLevel | undefined): string  | undefined{
    return level; // Enum values match Sabre strings (Preferred, Acceptable, etc.)
  }

  private mapSeatPosition(position?: SeatPosition): string | undefined {
    if (!position) return undefined;
    const mapping: Record<string, string> = {
      [SeatPosition.WINDOW]: 'Window',
      [SeatPosition.AISLE]: 'Aisle',
      [SeatPosition.MIDDLE]: 'Middle',
      [SeatPosition.ANY]: 'Any'
    };
    return mapping[position];
  }

  private mapSmokingPreference(pref: SmokingPreference): string {
    return pref === SmokingPreference.SMOKING ? 'true' : 'false';
  }

  private mapTransmissionType(type: TransmissionType): string {
    const mapping: Record<string, string> = {
      [TransmissionType.AUTOMATIC]: 'Automatic',
      [TransmissionType.MANUAL]: 'Manual',
      [TransmissionType.NO_PREFERENCE]: 'NoPreference'
    };
    return mapping[type] || 'NoPreference';
  }

  private mapRemarkType(type: RemarkType): string {
    return type; // Enum values match Sabre strings
  }

  private formatExpirationDate(month?: number | null | undefined, year?: number | null | undefined): string | undefined {
    if (!month || !year) return undefined;
    const m = month.toString().padStart(2, '0');
    const y = year.toString().slice(-2);
    return `${m}${y}`;
  }
}
