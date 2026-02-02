// ============================================================================
// Sabre Profile Update - Fixed Implementation with Loyalty & Emergency Contact
// ============================================================================

import { Builder } from "xml2js";

// ============================================================================
// Type Definitions
// ============================================================================

export type SubjectAreaName =
  | "PersonName"
  | "Telephone"
  | "Email"
  | "Address"
  | "PaymentForm"
  | "CustLoyalty"
  | "Document"
  | "AirlinePref"
  | "HotelPref"
  | "VehicleRentalPref"
  | "RailPref"
  | "GroundTransportationPref"
  | "PriorityRemarks"
  | "Remark"
  | "Discounts"
  | "SSR"
  | "OSI"
  | "EmergencyContactPerson"
  | "AgentRelatedIndividuals";

export interface PersonName {
  namePrefix?: string;
  givenName?: string;
  middleName?: string;
  surName?: string;
  nameSuffix?: string;
}

export interface Telephone {
  fullPhoneNumber?: string;
  countryCode?: string;
  areaCode?: string;
  phoneNumber?: string;
  extension?: string;
  deviceTypeCode?: string;
  locationTypeCode?: string;
}

export interface Email {
  emailAddress: string;
  emailTypeCode?: string;
  emailUsageCode?: string;
  formatTypeCode?: string;
}

export interface Address {
  addressLine?: string;
  addressLine2?: string;
  cityName?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
  streetNumber?: string;
  addressUsageTypeCode?: string;
}

export interface Document {
  docType: string;
  docNumber: string;
  docHolderName?: string;
  issuingCountry?: string;
  issueDate?: string;
  expiryDate?: string;
  birthDate?: string;
  birthCountry?: string;
  birthPlace?: string;
  genderCode?: string;
  holderNationalityCode?: string;
}

export interface PaymentForm {
  cardType: string;
  cardNumber: string;
  cardHolderName?: string;
  expiryDate: string;
  cvv?: string;
  billingAddress?: Address;
  effectiveDate?: string;
}

export interface LoyaltyProgram {
  vendorType?: string; // Default: "AL" (Airline)
  programId: string; // Airline/Hotel code
  membershipId: string;
  membershipLevel?: string;
  membershipLevelTypeCode?: string;
  programTypeCode?: string; // FT (Frequent Traveler)
  givenName?: string;
  middleName?: string;
  surName?: string;
  allianceCode?: string;
  allianceLevelValue?: string;
  accountBalance?: string;
  membershipStartDate?: string;
  displaySequenceNo?: number;
  orderSequenceNo?: number;
}

export interface EmergencyContact {
  relationTypeCode?: string;
  relationType?: string;
  birthDate?: string;
  informationText?: string;
  namePrefix?: string;
  givenName: string;
  surName: string;
  nameSuffix?: string;
  telephone?: Telephone;
  email?: Email;
  address?: Address;
}

export interface AirlinePreference {
  airlineCode?: string;
  preferLevel?: "Preferred" | "Required" | "Not Preferred";
  seatPreference?: string;
  mealPreference?: string;
  cabinPreference?: string;
  exclude?: boolean;
  orderPreferenceNo?: number;
}

export interface HotelPreference {
  chainCode?: string;
  hotelName?: string;
  roomType?: string;
  smoking?: boolean;
  bedType?: string;
  floorPreference?: string;
  maxRoomRate?: string;
  currencyCode?: string;
  preferLevel?: "Preferred" | "Required" | "Not Preferred";
  exclude?: boolean;
  orderPreferenceNo?: number;
}

export interface VehicleRentalPreference {
  vendorCode?: string;
  vehicleType?: string;
  transmissionType?: string;
  airConditioning?: boolean;
  size?: string;
  maxRateAmount?: string;
  currencyCode?: string;
  preferLevel?: "Preferred" | "Required" | "Not Preferred";
  exclude?: boolean;
  orderPreferenceNo?: number;
}

export interface Remark {
  key?: string;
  value: string;
  categoryCode?: string;
  typeCode?: string;
}

export interface Customer {
  personName?: PersonName;
  telephone?: Telephone;
  email?: Email;
  address?: Address;
  birthDate?: string;
  countryOfResidence?: string;
  nationalityCode?: string;
  genderCode?: string;
  maritalStatusCode?: string;
  documents?: Document[];
  paymentForms?: PaymentForm[];
  loyaltyPrograms?: LoyaltyProgram[];
  emergencyContacts?: EmergencyContact[];
}

export interface Preferences {
  airlinePreferences?: AirlinePreference[];
  hotelPreferences?: HotelPreference[];
  vehicleRentalPreferences?: VehicleRentalPreference[];
}

export interface UpdateProfilePayload {
  profileId?: string;
  useAuxiliaryId?: boolean;
  auxiliaryIdType?: string;
  auxiliaryIdValue?: string;
  clientCode: string;
  clientContext: string;
  domain: string;
  ignoreTimeStampCheck?: boolean;
  ignoreSubjectAreas?: SubjectAreaName[];
  customer?: Customer;
  preferences?: Preferences;
  remarks?: Remark[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapPreferLevel(
  preferLevel?: "Preferred" | "Required" | "Not Preferred",
): string {
  const mapping = {
    Preferred: "P",
    Required: "R",
    "Not Preferred": "N",
  };
  return preferLevel ? mapping[preferLevel] || "P" : "P";
}

function formatExpiryDate(expiryDate: string): string {
  if (expiryDate.length === 4) {
    const month = expiryDate.substring(0, 2);
    const year = expiryDate.substring(2, 4);
    return `${month}20${year}`;
  }
  return expiryDate;
}

// ============================================================================
// Main Build Function
// ============================================================================

export function buildUpdateRequest(
  payload: UpdateProfilePayload,
  currentProfile?: any,
) {
  const currentUpdateDateTime = new Date().toISOString();
  const currentCreateDateTime =
    currentProfile?.CreateDateTime || new Date().toISOString();

  // -------------------------------------------------------------------------
  // Build TPA_Identity
  // -------------------------------------------------------------------------
  const tpaIdentity: any = {
    $: {
      ProfileTypeCode: "TVL",
      ClientCode: payload.clientCode,
      ClientContextCode: payload.clientContext,
      DomainID: payload.domain,
    },
  };

  if (
    payload.useAuxiliaryId &&
    payload.auxiliaryIdType &&
    payload.auxiliaryIdValue
  ) {
    tpaIdentity.$.UniqueID = "*";
    tpaIdentity.AuxiliaryID = {
      $: {
        IDTypeCode: payload.auxiliaryIdType,
        Identifier: payload.auxiliaryIdValue,
      },
    };
  } else {
    tpaIdentity.$.UniqueID = payload.profileId;
  }

  // -------------------------------------------------------------------------
  // Build Customer Object
  // -------------------------------------------------------------------------
  const customer: any = {};

  // Person Name
  if (payload.customer?.personName) {
    customer.PersonName = {};
    if (payload.customer.personName.namePrefix) {
      customer.PersonName.NamePrefix = payload.customer.personName.namePrefix;
    }
    if (payload.customer.personName.givenName) {
      customer.PersonName.GivenName = payload.customer.personName.givenName;
    }
    if (payload.customer.personName.middleName) {
      customer.PersonName.MiddleName = payload.customer.personName.middleName;
    }
    if (payload.customer.personName.surName) {
      customer.PersonName.SurName = payload.customer.personName.surName;
    }
    if (payload.customer.personName.nameSuffix) {
      customer.PersonName.NameSuffix = payload.customer.personName.nameSuffix;
    }
  }

  // Telephone
  if (payload.customer?.telephone) {
    customer.Telephone = {};
    if (payload.customer.telephone.fullPhoneNumber) {
      customer.Telephone.FullPhoneNumber =
        payload.customer.telephone.fullPhoneNumber;
    } else {
      customer.Telephone.ParsedPhoneNumber = {
        $: {},
      };
      if (payload.customer.telephone.countryCode) {
        customer.Telephone.ParsedPhoneNumber.$.CountryCd =
          payload.customer.telephone.countryCode;
      }
      if (payload.customer.telephone.areaCode) {
        customer.Telephone.ParsedPhoneNumber.$.AreaCd =
          payload.customer.telephone.areaCode;
      }
      if (payload.customer.telephone.phoneNumber) {
        customer.Telephone.ParsedPhoneNumber.$.PhoneNumber =
          payload.customer.telephone.phoneNumber;
      }
      if (payload.customer.telephone.extension) {
        customer.Telephone.ParsedPhoneNumber.$.Extension =
          payload.customer.telephone.extension;
      }
    }
  }

  // Email
  if (payload.customer?.email) {
    customer.Email = {
      $: {
        EmailAddress: payload.customer.email.emailAddress,
        ...(payload.customer.email.emailTypeCode && {
          EmailTypeCode: payload.customer.email.emailTypeCode,
        }),
        ...(payload.customer.email.emailUsageCode && {
          EmailUsageCode: payload.customer.email.emailUsageCode,
        }),
        ...(payload.customer.email.formatTypeCode && {
          FormatTypeCode: payload.customer.email.formatTypeCode,
        }),
      },
    };
  }

  // Address
  if (payload.customer?.address) {
    customer.Address = {};
    if (payload.customer.address.addressLine) {
      customer.Address.AddressLine = [payload.customer.address.addressLine];
      if (payload.customer.address.addressLine2) {
        customer.Address.AddressLine.push(
          payload.customer.address.addressLine2,
        );
      }
    }
    if (payload.customer.address.cityName) {
      customer.Address.CityName = payload.customer.address.cityName;
    }
    if (payload.customer.address.postalCode) {
      customer.Address.PostalCd = payload.customer.address.postalCode;
    }
    if (payload.customer.address.stateCode) {
      customer.Address.StateCode = payload.customer.address.stateCode;
    }
    if (payload.customer.address.countryCode) {
      customer.Address.CountryCode = payload.customer.address.countryCode;
    }
    if (payload.customer.address.streetNumber) {
      customer.Address.StreetNmbr = payload.customer.address.streetNumber;
    }
  }

  // Customer Attributes
  if (
    payload.customer?.birthDate ||
    payload.customer?.countryOfResidence ||
    payload.customer?.nationalityCode ||
    payload.customer?.genderCode ||
    payload.customer?.maritalStatusCode
  ) {
    customer.$ = customer.$ || {};
    if (payload.customer.birthDate) {
      customer.$.BirthDate = payload.customer.birthDate;
    }
    if (payload.customer.countryOfResidence) {
      customer.$.CountryOfResidence = payload.customer.countryOfResidence;
    }
    if (payload.customer.nationalityCode) {
      customer.$.NationalityCode = payload.customer.nationalityCode;
    }
    if (payload.customer.genderCode) {
      customer.$.GenderCode = payload.customer.genderCode;
    }
    if (payload.customer.maritalStatusCode) {
      customer.$.MaritalStatusCode = payload.customer.maritalStatusCode;
    }
  }

  // Payment Forms - Position 1 (after Address)
  if (
    payload.customer?.paymentForms &&
    payload.customer.paymentForms.length > 0
  ) {
    customer.PaymentForm = payload.customer.paymentForms.map((payment) => {
      const expireDate = formatExpiryDate(payment.expiryDate);

      const paymentObj: any = {
        PaymentCard: {
          $: {
            BankCardVendorCode: payment.cardType,
            CardNumber: payment.cardNumber,
            ExpireDate: expireDate,
          },
        },
      };

      if (payment.cardHolderName) {
        paymentObj.PaymentCard.CardHolderName = {
          CardHolderFullName: payment.cardHolderName,
        };
      }

      if (payment.billingAddress) {
        paymentObj.PaymentCard.Address = {};
        if (payment.billingAddress.addressLine) {
          paymentObj.PaymentCard.Address.AddressLine = [
            payment.billingAddress.addressLine,
          ];
          if (payment.billingAddress.addressLine2) {
            paymentObj.PaymentCard.Address.AddressLine.push(
              payment.billingAddress.addressLine2,
            );
          }
        }
        if (payment.billingAddress.cityName) {
          paymentObj.PaymentCard.Address.CityName =
            payment.billingAddress.cityName;
        }
        if (payment.billingAddress.postalCode) {
          paymentObj.PaymentCard.Address.PostalCd =
            payment.billingAddress.postalCode;
        }
        if (payment.billingAddress.stateCode) {
          paymentObj.PaymentCard.Address.StateCode =
            payment.billingAddress.stateCode;
        }
        if (payment.billingAddress.countryCode) {
          paymentObj.PaymentCard.Address.CountryCode =
            payment.billingAddress.countryCode;
        }
      }

      if (payment.effectiveDate) {
        paymentObj.PaymentCard.$.EffectiveDate = payment.effectiveDate;
      }

      return paymentObj;
    });
  }

  // Emergency Contact Person - Position 2 (MUST come BEFORE Document and CustLoyalty!)
  if (
    payload.customer?.emergencyContacts &&
    payload.customer.emergencyContacts.length > 0
  ) {
    customer.EmergencyContactPerson = payload.customer.emergencyContacts.map(
      (contact, index) => {
        const emergencyContact: any = {
          $: {
            DisplaySequenceNo: String(index + 1),
            OrderSequenceNo: String(index + 1),
          },
        };

        // Add relation type
        if (contact.relationTypeCode) {
          emergencyContact.$.RelationTypeCode = contact.relationTypeCode;
        }
        if (contact.relationType) {
          emergencyContact.$.RelationType = contact.relationType;
        }
        if (contact.birthDate) {
          emergencyContact.$.BirthDate = contact.birthDate;
        }
        if (contact.informationText) {
          emergencyContact.$.InformationText = contact.informationText;
        }

        // Add name fields
        if (contact.namePrefix) {
          emergencyContact.NamePrefix = contact.namePrefix;
        }
        emergencyContact.GivenName = contact.givenName;
        emergencyContact.SurName = contact.surName;
        if (contact.nameSuffix) {
          emergencyContact.NameSuffix = contact.nameSuffix;
        }

        // Add telephone if provided
        if (contact.telephone) {
          emergencyContact.Telephone = {};
          if (contact.telephone.fullPhoneNumber) {
            emergencyContact.Telephone.FullPhoneNumber =
              contact.telephone.fullPhoneNumber;
          } else if (contact.telephone.phoneNumber) {
            emergencyContact.Telephone.ParsedPhoneNumber = {
              $: {
                ...(contact.telephone.countryCode && {
                  CountryCd: contact.telephone.countryCode,
                }),
                ...(contact.telephone.areaCode && {
                  AreaCd: contact.telephone.areaCode,
                }),
                PhoneNumber: contact.telephone.phoneNumber,
                ...(contact.telephone.extension && {
                  Extension: contact.telephone.extension,
                }),
              },
            };
          }
        }

        // Add email if provided
        if (contact.email) {
          emergencyContact.Email = {
            $: {
              EmailAddress: contact.email.emailAddress,
              ...(contact.email.emailTypeCode && {
                EmailTypeCode: contact.email.emailTypeCode,
              }),
            },
          };
        }

        // Add address if provided
        if (contact.address) {
          emergencyContact.Address = {};
          if (contact.address.addressLine) {
            emergencyContact.Address.AddressLine = [
              contact.address.addressLine,
            ];
          }
          if (contact.address.cityName) {
            emergencyContact.Address.CityName = contact.address.cityName;
          }
          if (contact.address.postalCode) {
            emergencyContact.Address.PostalCd = contact.address.postalCode;
          }
          if (contact.address.stateCode) {
            emergencyContact.Address.StateCode = contact.address.stateCode;
          }
          if (contact.address.countryCode) {
            emergencyContact.Address.CountryCode = contact.address.countryCode;
          }
        }

        return emergencyContact;
      },
    );
  }

  // Documents - Position 3 (MUST come AFTER EmergencyContactPerson, BEFORE CustLoyalty)
  if (payload.customer?.documents && payload.customer.documents.length > 0) {
    customer.Document = payload.customer.documents.map((doc) => {
      const docObj: any = {
        $: {
          DocTypeCode: doc.docType,
          DocID: doc.docNumber,
          ...(doc.issuingCountry && {
            DocIssueCountryCode: doc.issuingCountry,
          }),
          ...(doc.issueDate && { EffectiveDate: doc.issueDate }),
          ...(doc.expiryDate && { ExpireDate: doc.expiryDate }),
          ...(doc.birthDate && { BirthDate: doc.birthDate }),
          ...(doc.birthCountry && { BirthCountryCode: doc.birthCountry }),
          ...(doc.birthPlace && { BirthPlace: doc.birthPlace }),
          ...(doc.genderCode && { GenderCode: doc.genderCode }),
          ...(doc.holderNationalityCode && {
            DocHolderNationalityCode: doc.holderNationalityCode,
          }),
        },
      };

      if (doc.docHolderName) {
        docObj.DocHolderName = doc.docHolderName;
      }

      return docObj;
    });
  }

  // Loyalty Programs - Position 4 (MUST come AFTER Document)
  if (payload.customer?.loyaltyPrograms?.length) {
    // Loyalty Programs - Position 4 (MUST come AFTER Document)
    if (
      payload.customer?.loyaltyPrograms &&
      payload.customer.loyaltyPrograms.length > 0
    ) {
      customer.CustLoyalty = payload.customer.loyaltyPrograms.map(
        (loyalty, index) => {
          const custLoyalty: any = {
            $: {
              VendorCode: loyalty.programId,
              VendorTypeCode: loyalty.vendorType || "AL",
              MembershipID: loyalty.membershipId,
              DisplaySequenceNo: String(loyalty.displaySequenceNo || index + 1),
              OrderSequenceNo: String(loyalty.orderSequenceNo || index + 1),
            },
          };

          if (loyalty.programTypeCode) {
            custLoyalty.$.ProgramTypeCode = loyalty.programTypeCode;
          }

          // Name fields
          if (loyalty.givenName) custLoyalty.GivenName = loyalty.givenName;
          if (loyalty.middleName) custLoyalty.MiddleName = loyalty.middleName;
          if (loyalty.surName) custLoyalty.SurName = loyalty.surName;

          // Membership Level
       // Membership Level
if (loyalty.membershipLevel) {
  let levelTypeCode = loyalty.membershipLevelTypeCode;

  // Airline FT programs must be numeric tiers
  if (loyalty.programTypeCode === "FT" && (loyalty.vendorType || "AL") === "AL") {
    // Ensure numeric MembershipLevelValue
    if (!/^\d+$/.test(loyalty.membershipLevel)) {
      console.warn(
        `Replacing non-numeric membership level '${loyalty.membershipLevel}' with default '01' for airline FT program`
      );
      loyalty.membershipLevel = "01"; // default numeric tier
    }
    levelTypeCode = "TI"; // must be TI
  } else {
    // For non-airline FT programs, allow ST for status names
    if (!/^\d+$/.test(loyalty.membershipLevel)) {
      levelTypeCode = "ST";
    } else {
      levelTypeCode = levelTypeCode || "TI";
    }
  }

  custLoyalty.MembershipLevel = {
    $: {
      MembershipLevelValue: loyalty.membershipLevel,
      MembershipLevelTypeCode: levelTypeCode,
    },
  };

  if (loyalty.allianceCode) custLoyalty.MembershipLevel.$.AllianceCode = loyalty.allianceCode;
  if (loyalty.allianceLevelValue) custLoyalty.MembershipLevel.$.AllianceLevelValue = loyalty.allianceLevelValue;
}

          // Loyalty totals
          if (loyalty.accountBalance || loyalty.membershipStartDate) {
            custLoyalty.CustLoyaltyTotals = { $: {} };
            if (loyalty.accountBalance)
              custLoyalty.CustLoyaltyTotals.$.AccountBalance =
                loyalty.accountBalance;
            if (loyalty.membershipStartDate)
              custLoyalty.CustLoyaltyTotals.$.MembershipStartDate =
                loyalty.membershipStartDate;
          }

          return custLoyalty;
        },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Build Traveler Object
  // -------------------------------------------------------------------------
  const traveler: any = {};

  if (Object.keys(customer).length > 0) {
    traveler.Customer = customer;
  }

  // -------------------------------------------------------------------------
  // Add Preferences (PrefCollections)
  // -------------------------------------------------------------------------
  const prefCollections: any = {};

  // Airline Preferences
  if (
    payload.preferences?.airlinePreferences &&
    payload.preferences.airlinePreferences.length > 0
  ) {
    const airlinePrefContent: any = {
      $: {
        TripTypeCode: "AZ",
      },
    };

    const seatPreferences = payload.preferences.airlinePreferences.filter(
      (pref) => pref.seatPreference,
    );

    if (seatPreferences.length > 0) {
      airlinePrefContent.AirlineSeatPref = seatPreferences.map(
        (pref, index) => ({
          $: {
            PreferLevelCode: mapPreferLevel(pref.preferLevel),
            DisplaySequenceNo: String(index + 1),
            OrderSequenceNo: String(index + 1),
          },
          SeatInfo: {
            $: {
              SeatPreferenceCode: pref.seatPreference,
              ...(pref.airlineCode && { VendorCode: pref.airlineCode }),
            },
          },
        }),
      );
    }

    const cabinPreferences = payload.preferences.airlinePreferences.filter(
      (pref) => pref.cabinPreference,
    );

    if (cabinPreferences.length > 0) {
      airlinePrefContent.AirlineCabinPref = cabinPreferences.map(
        (pref, index) => ({
          $: {
            PreferLevelCode: mapPreferLevel(pref.preferLevel),
            DisplaySequenceNo: String(index + 1),
            OrderSequenceNo: String(index + 1),
          },
          CabinInfo: {
            $: {
              CabinNameCode: pref.cabinPreference,
              ...(pref.airlineCode && { VendorCode: pref.airlineCode }),
            },
          },
        }),
      );
    }

    const mealPreferences = payload.preferences.airlinePreferences.filter(
      (pref) => pref.mealPreference,
    );

    if (mealPreferences.length > 0) {
      airlinePrefContent.AirlineMealPref = mealPreferences.map(
        (pref, index) => ({
          $: {
            PreferLevelCode: mapPreferLevel(pref.preferLevel),
            DisplaySequenceNo: String(index + 1),
            OrderSequenceNo: String(index + 1),
          },
          MealInfo: {
            $: {
              MealTypeCode: pref.mealPreference,
              ...(pref.airlineCode && { VendorCode: pref.airlineCode }),
            },
          },
        }),
      );
    }

    const preferredAirlines = payload.preferences.airlinePreferences.filter(
      (pref) => pref.airlineCode,
    );

    if (preferredAirlines.length > 0) {
      airlinePrefContent.PreferredAirlines = preferredAirlines.map(
        (pref, index) => ({
          $: {
            VendorCode: pref.airlineCode,
            PreferLevelCode: mapPreferLevel(pref.preferLevel),
            ...(pref.exclude !== undefined && { Exclude: pref.exclude }),
            ...(pref.orderPreferenceNo && {
              OrderPreferenceNo: pref.orderPreferenceNo,
            }),
            DisplaySequenceNo: String(index + 1),
            OrderSequenceNo: String(index + 1),
          },
        }),
      );
    }

    prefCollections.AirlinePref = airlinePrefContent;
  }

  // Hotel Preferences
  if (
    payload.preferences?.hotelPreferences &&
    payload.preferences.hotelPreferences.length > 0
  ) {
    prefCollections.HotelPref = {
      $: {
        TripTypeCode: "AZ",
      },
      PreferredHotel: payload.preferences.hotelPreferences.map(
        (pref, index) => {
          const hotelPref: any = {
            $: {
              PreferLevelCode: mapPreferLevel(pref.preferLevel),
              DisplaySequenceNo: index + 1,
              OrderSequenceNo: index + 1,
              ...(pref.exclude !== undefined && { Exclude: pref.exclude }),
              ...(pref.orderPreferenceNo && {
                OrderPreferenceNo: pref.orderPreferenceNo,
              }),
            },
          };

          if (pref.chainCode) {
            hotelPref.$.HotelChainCode = pref.chainCode;
            hotelPref.$.HotelVendorCode = pref.chainCode;
          }
          if (pref.hotelName) {
            hotelPref.$.HotelName = pref.hotelName;
          }
          if (pref.roomType) {
            hotelPref.$.RoomTypeCode = pref.roomType;
          }

          if (pref.maxRoomRate || pref.currencyCode) {
            hotelPref.HotelRate = {
              $: {
                ...(pref.maxRoomRate && { MaxRoomRate: pref.maxRoomRate }),
                CurrencyCode: pref.currencyCode || "USD",
              },
            };
          }

          return hotelPref;
        },
      ),
    };
  }

  // Vehicle Rental Preferences
  if (
    payload.preferences?.vehicleRentalPreferences &&
    payload.preferences.vehicleRentalPreferences.length > 0
  ) {
    prefCollections.VehicleRentalPref = {
      $: {
        TripTypeCode: "AZ",
      },
      PreferredVehicleVendors: payload.preferences.vehicleRentalPreferences.map(
        (pref, index) => {
          const vehiclePref: any = {
            $: {
              PreferLevelCode: mapPreferLevel(pref.preferLevel),
              DisplaySequenceNo: index + 1,
              OrderSequenceNo: index + 1,
              ...(pref.exclude !== undefined && { Exclude: pref.exclude }),
              ...(pref.orderPreferenceNo && {
                OrderPreferenceNo: pref.orderPreferenceNo,
              }),
            },
          };

          if (pref.vendorCode) {
            vehiclePref.$.VendorCode = pref.vendorCode;
          }
          if (pref.vehicleType) {
            vehiclePref.$.VehicleTypeCode = pref.vehicleType;
          }

          if (pref.maxRateAmount || pref.currencyCode) {
            vehiclePref.VehicleRate = {
              $: {
                ...(pref.maxRateAmount && {
                  MaxRateAmount: pref.maxRateAmount,
                }),
                CurrencyCode: pref.currencyCode || "USD",
              },
            };
          }

          if (pref.size || pref.transmissionType) {
            vehiclePref.VehicleType = {
              PseudoType: {
                $: {
                  VehiclePseudoTypeCode: pref.vehicleType || "ECAR",
                },
              },
            };
          }

          return vehiclePref;
        },
      ),
    };
  }

  if (Object.keys(prefCollections).length > 0) {
    traveler.PrefCollections = prefCollections;
  }

  // -------------------------------------------------------------------------
  // Add TPA_Extensions for Remarks
  // -------------------------------------------------------------------------
  if (payload.remarks && payload.remarks.length > 0) {
    traveler.TPA_Extensions = traveler.TPA_Extensions || {};
    traveler.TPA_Extensions.PriorityRemarks = payload.remarks.map((r) => ({
      $: {
        Text: r.key ? `${r.key}:${r.value}` : r.value,
        ...(r.categoryCode && { CategoryCode: r.categoryCode }),
      },
    }));
  }

  // -------------------------------------------------------------------------
  // Build Profile Content
  // -------------------------------------------------------------------------
  const profileContent: any = {
    $: {
      CreateDateTime: currentCreateDateTime,
      UpdateDateTime: currentUpdateDateTime,
    },
    TPA_Identity: tpaIdentity,
  };

  if (Object.keys(traveler).length > 0) {
    profileContent.Traveler = traveler;
  }

  // -------------------------------------------------------------------------
  // Build IgnoreSubjectArea
  // -------------------------------------------------------------------------
  const defaultIgnoreAreas: SubjectAreaName[] = [];

  if (!payload.customer?.personName) {
    defaultIgnoreAreas.push("PersonName");
  }
  if (!payload.customer?.telephone) {
    defaultIgnoreAreas.push("Telephone");
  }
  if (!payload.customer?.email) {
    defaultIgnoreAreas.push("Email");
  }
  if (!payload.customer?.address) {
    defaultIgnoreAreas.push("Address");
  }
  if (
    !payload.customer?.loyaltyPrograms ||
    payload.customer.loyaltyPrograms.length === 0
  ) {
    defaultIgnoreAreas.push("CustLoyalty");
  }
  if (!payload.customer?.documents || payload.customer.documents.length === 0) {
    defaultIgnoreAreas.push("Document");
  }
  if (
    !payload.customer?.paymentForms ||
    payload.customer.paymentForms.length === 0
  ) {
    defaultIgnoreAreas.push("PaymentForm");
  }
  if (
    !payload.customer?.emergencyContacts ||
    payload.customer.emergencyContacts.length === 0
  ) {
    defaultIgnoreAreas.push("EmergencyContactPerson");
  }
  if (
    !payload.preferences?.airlinePreferences ||
    payload.preferences.airlinePreferences.length === 0
  ) {
    defaultIgnoreAreas.push("AirlinePref");
  }
  if (
    !payload.preferences?.hotelPreferences ||
    payload.preferences.hotelPreferences.length === 0
  ) {
    defaultIgnoreAreas.push("HotelPref");
  }
  if (
    !payload.preferences?.vehicleRentalPreferences ||
    payload.preferences.vehicleRentalPreferences.length === 0
  ) {
    defaultIgnoreAreas.push("VehicleRentalPref");
  }
  if (!payload.remarks || payload.remarks.length === 0) {
    defaultIgnoreAreas.push("PriorityRemarks");
    defaultIgnoreAreas.push("Remark");
  }

  const finalIgnoreAreas = [
    ...new Set([...defaultIgnoreAreas, ...(payload.ignoreSubjectAreas || [])]),
  ];

  if (finalIgnoreAreas.length > 0) {
    profileContent.IgnoreSubjectArea = {
      SubjectAreaName: finalIgnoreAreas,
    };
  }

  // -------------------------------------------------------------------------
  // Build Root Request Object
  // -------------------------------------------------------------------------
  const requestRoot: any = {
    Sabre_OTA_ProfileUpdateRQ: {
      $: {
        Version: "6.99.2",
        Target: "Production",
        xmlns: "http://www.sabre.com/eps/schemas",
      },
      ProfileInfo: {
        Profile: profileContent,
      },
    },
  };

  if (payload.ignoreTimeStampCheck) {
    requestRoot.Sabre_OTA_ProfileUpdateRQ.$.IgnoreTimeStampCheck = "Y";
  }

  return requestRoot;
}

// ============================================================================
// XML Generation Function
// ============================================================================

export function generateXML(requestObject: any): string {
  const builder = new Builder({
    xmldec: { version: "1.0", encoding: "UTF-8" },
    renderOpts: { pretty: true, indent: "  " },
  });
  return builder.buildObject(requestObject);
}

// ============================================================================
// Complete Update Function
// ============================================================================

export function updateSabreProfile(
  payload: UpdateProfilePayload,
  currentProfile?: any,
): any {
  return buildUpdateRequest(payload, currentProfile);
}

export function updateSabreProfileToXML(
  payload: UpdateProfilePayload,
  currentProfile?: any,
): string {
  const requestObject = buildUpdateRequest(payload, currentProfile);
  return generateXML(requestObject);
}
