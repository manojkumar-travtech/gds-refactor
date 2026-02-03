// ============================================================================
// Sabre Profile Update Builder — Updated
// Changes from previous version:
//   - EmergencyContact.telephones  → array (multiple <Telephone> elements)
//   - EmergencyTelephone           → supports fullPhoneNumber OR parsedPhoneNumber
//                                     + locationTypeCode, deviceTypeCode, purposeCode,
//                                       displaySequenceNo, orderSequenceNo
//   - EmergencyEmail               → added purposeCode, displaySequenceNo, orderSequenceNo
//   - EmergencyAddress             → added locationTypeCode, addressUsageTypeCode,
//                                     attention, mailStop, displaySequenceNo, orderSequenceNo
//   - LoyaltyProgram               → respects caller-provided membershipLevelTypeCode (ST/TI)
//                                     instead of forcing numeric + TI for all airline FT
// ============================================================================

import { Builder } from "xml2js";

// ============================================================================
// Types
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

// ── Core shared types ────────────────────────────────────────────────────────

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

// ── Emergency-contact-specific extended types ───────────────────────────────

export interface EmergencyTelephone {
  fullPhoneNumber?: string;
  parsedPhoneNumber?: {
    countryCd?: string;
    areaCd?: string;
    phoneNumber: string;
    extension?: string;
  };
  locationTypeCode?: string;
  deviceTypeCode?: string;
  purposeCode?: string;
  displaySequenceNo?: number;
  orderSequenceNo?: number;
}

export interface EmergencyEmail {
  emailAddress: string;
  emailTypeCode?: string;
  emailUsageCode?: string;
  formatTypeCode?: string;
  purposeCode?: string;
  displaySequenceNo?: number;
  orderSequenceNo?: number;
}

export interface EmergencyAddress {
  addressLine?: string;
  addressLine2?: string;
  cityName?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
  streetNumber?: string;
  locationTypeCode?: string;
  addressUsageTypeCode?: string;
  attention?: string;
  mailStop?: string;
  displaySequenceNo?: number;
  orderSequenceNo?: number;
}

export interface EmergencyContact {
  relationTypeCode?: string;
  relationType?: string;
  birthDate?: string;
  informationText?: string;
  displaySequenceNo?: number;
  orderSequenceNo?: number;
  namePrefix?: string;
  givenName: string;
  surName: string;
  nameSuffix?: string;
  telephones?: EmergencyTelephone[];
  email?: EmergencyEmail;
  address?: EmergencyAddress;
}

// ── Document / Payment / Loyalty ─────────────────────────────────────────────

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
  givenName?: string;
  middleName?: string;
  surName?: string;
  namePrefix?: string;
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
  vendorType?: string;
  programId: string;
  membershipId: string;
  membershipLevel?: string;
  membershipLevelTypeCode?: string; // ST (named) | TI (numeric) — caller decides
  programTypeCode?: string;
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

// ── Preferences ──────────────────────────────────────────────────────────────

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

// ── Top-level payload ────────────────────────────────────────────────────────

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
// Shared Helpers
// ============================================================================

function mapPreferLevel(
  preferLevel?: "Preferred" | "Required" | "Not Preferred",
): string {
  const map: Record<string, string> = {
    Preferred: "P",
    Required: "R",
    "Not Preferred": "N",
  };
  return preferLevel ? map[preferLevel] || "P" : "P";
}

function formatExpiryDate(raw: string): string {
  if (raw.length === 4) {
    return raw.substring(0, 2) + "20" + raw.substring(2, 4);
  }
  return raw;
}

function buildAddressChild(addr: Address): any {
  const out: any = {};
  if (addr.addressLine) {
    out.AddressLine = addr.addressLine2
      ? [addr.addressLine, addr.addressLine2]
      : [addr.addressLine];
  }
  if (addr.cityName) out.CityName = addr.cityName;
  if (addr.postalCode) out.PostalCd = addr.postalCode;
  if (addr.stateCode) out.StateCode = addr.stateCode;
  if (addr.countryCode) out.CountryCode = addr.countryCode;
  if (addr.streetNumber) out.StreetNmbr = addr.streetNumber;
  return out;
}

// ============================================================================
// Section 1 — TPA_Identity
// ============================================================================

function buildTpaIdentity(payload: UpdateProfilePayload): any {
  const identity: any = {
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
    identity.$.UniqueID = "*";
    identity.AuxiliaryID = {
      $: {
        IDTypeCode: payload.auxiliaryIdType,
        Identifier: payload.auxiliaryIdValue,
      },
    };
  } else {
    identity.$.UniqueID = payload.profileId;
  }

  return identity;
}

// ============================================================================
// Section 2 — PersonName
// ============================================================================

function buildPersonName(personName?: PersonName): any | undefined {
  if (!personName) return undefined;

  const out: any = {};
  if (personName.namePrefix) out.NamePrefix = personName.namePrefix;
  if (personName.givenName) out.GivenName = personName.givenName;
  if (personName.middleName) out.MiddleName = personName.middleName;
  if (personName.surName) out.SurName = personName.surName;
  if (personName.nameSuffix) out.NameSuffix = personName.nameSuffix;

  return Object.keys(out).length ? out : undefined;
}

// ============================================================================
// Section 3 — Telephone  (top-level customer)
// ============================================================================

function buildTelephone(telephone?: Telephone): any | undefined {
  if (!telephone) return undefined;

  const out: any = {};
  if (telephone.fullPhoneNumber) {
    out.FullPhoneNumber = telephone.fullPhoneNumber;
  } else {
    const parsed: any = { $: {} };
    if (telephone.countryCode) parsed.$.CountryCd = telephone.countryCode;
    if (telephone.areaCode) parsed.$.AreaCd = telephone.areaCode;
    if (telephone.phoneNumber) parsed.$.PhoneNumber = telephone.phoneNumber;
    if (telephone.extension) parsed.$.Extension = telephone.extension;
    out.ParsedPhoneNumber = parsed;
  }
  return out;
}

// ============================================================================
// Section 4 — Email  (top-level customer)
// ============================================================================

function buildEmail(email?: Email): any | undefined {
  if (!email) return undefined;

  const attrs: any = { EmailAddress: email.emailAddress };
  if (email.emailTypeCode) attrs.EmailTypeCode = email.emailTypeCode;
  if (email.emailUsageCode) attrs.EmailUsageCode = email.emailUsageCode;
  if (email.formatTypeCode) attrs.FormatTypeCode = email.formatTypeCode;

  return { $: attrs };
}

// ============================================================================
// Section 5 — Address  (top-level customer)
// ============================================================================

function buildAddress(address?: Address): any | undefined {
  if (!address) return undefined;
  return buildAddressChild(address);
}

// ============================================================================
// Section 6 — PaymentForm  (array)
// ============================================================================

function buildPaymentForms(paymentForms?: PaymentForm[]): any[] | undefined {
  if (!paymentForms || paymentForms.length === 0) return undefined;

  return paymentForms.map((payment) => {
    const cardAttrs: any = {
      BankCardVendorCode: payment.cardType,
      CardNumber: payment.cardNumber,
      ExpireDate: formatExpiryDate(payment.expiryDate),
    };
    if (payment.effectiveDate) cardAttrs.EffectiveDate = payment.effectiveDate;

    const paymentCard: any = { $: cardAttrs };

    if (payment.cardHolderName) {
      paymentCard.CardHolderName = {
        CardHolderFullName: payment.cardHolderName,
      };
    }
    if (payment.billingAddress) {
      paymentCard.Address = buildAddressChild(payment.billingAddress);
    }

    return { PaymentCard: paymentCard };
  });
}

// ============================================================================
// Section 7 — EmergencyContactPerson  (array)
//
//   XML output per contact:
//
//   <EmergencyContactPerson RelationTypeCode="HU" RelationType="Husband"
//       BirthDate="2007-10-01" DisplaySequenceNo="1" OrderSequenceNo="1"
//       InformationText="Info">
//     <NamePrefix>Mr</NamePrefix>
//     <GivenName>Greg</GivenName>
//     <SurName>Stepien</SurName>
//     <NameSuffix>II</NameSuffix>
//     <Telephone LocationTypeCode="HOM" DeviceTypeCode="VC"
//         PurposeCode="BIL" DisplaySequenceNo="1" OrderSequenceNo="1">
//       <FullPhoneNumber>542346463232</FullPhoneNumber>
//     </Telephone>
//     <Telephone LocationTypeCode="HOM" DeviceTypeCode="VC"
//         PurposeCode="BIL" DisplaySequenceNo="1" OrderSequenceNo="2">
//       <ParsedPhoneNumber CountryCd="01" AreaCd="01"
//           PhoneNumber="4522252" Extension="048"/>
//     </Telephone>
//     <Email EmailTypeCode="BUS" EmailUsageCode="RPL" FormatTypeCode="BOTH"
//         EmailAddress="441554hh.sabre.com" PurposeCode="ALL"
//         DisplaySequenceNo="1" OrderSequenceNo="1"/>
//     <Address LocationTypeCode="HOM" AddressUsageTypeCode="BUS"
//         Attention="Emergency Contact Address"
//         DisplaySequenceNo="1" OrderSequenceNo="1">
//       <AddressLine>fffgh55</AddressLine>
//       <MailStop>MS999</MailStop>
//       <CityName>yghg444</CityName>
//       <PostalCd>80225</PostalCd>
//       <StateCode>CO</StateCode>
//       <CountryCode>US</CountryCode>
//       <StreetNmbr>4544fff</StreetNmbr>
//     </Address>
//   </EmergencyContactPerson>
// ============================================================================

function buildEmergencyContacts(
  contacts?: EmergencyContact[],
): any[] | undefined {
  if (!contacts || contacts.length === 0) return undefined;

  return contacts.map((contact, index) => {
    // ── top-level attributes ──
    const attrs: any = {
      DisplaySequenceNo: String(contact.displaySequenceNo || index + 1),
      OrderSequenceNo: String(contact.orderSequenceNo || index + 1),
    };
    if (contact.relationTypeCode)
      attrs.RelationTypeCode = contact.relationTypeCode;
    if (contact.relationType) attrs.RelationType = contact.relationType;
    if (contact.birthDate) attrs.BirthDate = contact.birthDate;
    if (contact.informationText)
      attrs.InformationText = contact.informationText;

    const out: any = { $: attrs };

    // ── name (order matters) ──
    if (contact.namePrefix) out.NamePrefix = contact.namePrefix;
    out.GivenName = contact.givenName;
    out.SurName = contact.surName;
    if (contact.nameSuffix) out.NameSuffix = contact.nameSuffix;

    // ── Telephone[]  — maps to multiple <Telephone> elements ──
    if (contact.telephones && contact.telephones.length > 0) {
      out.Telephone = contact.telephones.map((tel) => {
        const telAttrs: any = {};
        if (tel.locationTypeCode)
          telAttrs.LocationTypeCode = tel.locationTypeCode;
        if (tel.deviceTypeCode) telAttrs.DeviceTypeCode = tel.deviceTypeCode;
        if (tel.purposeCode) telAttrs.PurposeCode = tel.purposeCode;
        if (tel.displaySequenceNo)
          telAttrs.DisplaySequenceNo = String(tel.displaySequenceNo);
        if (tel.orderSequenceNo)
          telAttrs.OrderSequenceNo = String(tel.orderSequenceNo);

        const telOut: any = { $: telAttrs };

        if (tel.fullPhoneNumber) {
          // <FullPhoneNumber>542346463232</FullPhoneNumber>
          telOut.FullPhoneNumber = tel.fullPhoneNumber;
        } else if (tel.parsedPhoneNumber) {
          // <ParsedPhoneNumber CountryCd="01" AreaCd="01" PhoneNumber="4522252" Extension="048"/>
          const parsedAttrs: any = {};
          if (tel.parsedPhoneNumber.countryCd)
            parsedAttrs.CountryCd = tel.parsedPhoneNumber.countryCd;
          if (tel.parsedPhoneNumber.areaCd)
            parsedAttrs.AreaCd = tel.parsedPhoneNumber.areaCd;
          if (tel.parsedPhoneNumber.phoneNumber)
            parsedAttrs.PhoneNumber = tel.parsedPhoneNumber.phoneNumber;
          if (tel.parsedPhoneNumber.extension)
            parsedAttrs.Extension = tel.parsedPhoneNumber.extension;
          telOut.ParsedPhoneNumber = { $: parsedAttrs };
        }

        return telOut;
      });
    }

    // ── Email (single — with all extended attrs) ──
    if (contact.email) {
      const emailAttrs: any = { EmailAddress: contact.email.emailAddress };
      if (contact.email.emailTypeCode)
        emailAttrs.EmailTypeCode = contact.email.emailTypeCode;
      if (contact.email.emailUsageCode)
        emailAttrs.EmailUsageCode = contact.email.emailUsageCode;
      if (contact.email.formatTypeCode)
        emailAttrs.FormatTypeCode = contact.email.formatTypeCode;
      if (contact.email.purposeCode)
        emailAttrs.PurposeCode = contact.email.purposeCode;
      if (contact.email.displaySequenceNo)
        emailAttrs.DisplaySequenceNo = String(contact.email.displaySequenceNo);
      if (contact.email.orderSequenceNo)
        emailAttrs.OrderSequenceNo = String(contact.email.orderSequenceNo);

      out.Email = { $: emailAttrs };
    }

    // ── Address (single — with all extended attrs) ──
    if (contact.address) {
      const addrAttrs: any = {};
      if (contact.address.locationTypeCode)
        addrAttrs.LocationTypeCode = contact.address.locationTypeCode;
      if (contact.address.addressUsageTypeCode)
        addrAttrs.AddressUsageTypeCode = contact.address.addressUsageTypeCode;
      if (contact.address.attention)
        addrAttrs.Attention = contact.address.attention;
      if (contact.address.displaySequenceNo)
        addrAttrs.DisplaySequenceNo = String(contact.address.displaySequenceNo);
      if (contact.address.orderSequenceNo)
        addrAttrs.OrderSequenceNo = String(contact.address.orderSequenceNo);

      const addrOut: any = { $: addrAttrs };

      // children — Sabre order: AddressLine → MailStop → CityName → PostalCd → StateCode → CountryCode → StreetNmbr
      if (contact.address.addressLine) {
        addrOut.AddressLine = contact.address.addressLine2
          ? [contact.address.addressLine, contact.address.addressLine2]
          : [contact.address.addressLine];
      }
      if (contact.address.mailStop) addrOut.MailStop = contact.address.mailStop;
      if (contact.address.cityName) addrOut.CityName = contact.address.cityName;
      if (contact.address.postalCode)
        addrOut.PostalCd = contact.address.postalCode;
      if (contact.address.stateCode)
        addrOut.StateCode = contact.address.stateCode;
      if (contact.address.countryCode)
        addrOut.CountryCode = contact.address.countryCode;
      if (contact.address.streetNumber)
        addrOut.StreetNmbr = contact.address.streetNumber;

      out.Address = addrOut;
    }

    return out;
  });
}

// ============================================================================
// Section 8 — Document  (array — PSPT / KTN / REDRESS)
// ============================================================================
function buildDocuments(documents?: Document[]): any[] | undefined {
  if (!documents || documents.length === 0) return undefined;

  return documents.map((doc) => {
    // Map deprecated doc types to new codes
    let docTypeCode = doc.docType;
    if (docTypeCode === "KTN") docTypeCode = "KTID"; // Known Traveler
    if (docTypeCode === "RDR") docTypeCode = "RDRS"; // Redress

    const attrs: any = {
      DocTypeCode: docTypeCode,
      DocID: doc.docNumber,
    };

    if (doc.issuingCountry) {
      attrs.DocIssueCountryCode = doc.issuingCountry;
    }

    const out: any = { $: attrs };

    // ---- KTN / RDRS ----
    if (docTypeCode === "KTID" || docTypeCode === "RDRS") {
      out.DocHolder = {};

      // ORDER IS IMPORTANT
      if (doc.namePrefix) out.DocHolder.NamePrefix = doc.namePrefix;
      if (doc.surName) out.DocHolder.SurName = doc.surName;
      if (doc.givenName) out.DocHolder.GivenName = doc.givenName;
      if (doc.middleName) out.DocHolder.MiddleName = doc.middleName;

      return out;
    }

    // ---- Other documents (Passport etc) ----
    if (doc.docHolderName) out.DocHolderName = doc.docHolderName;
    if (doc.issueDate) attrs.EffectiveDate = doc.issueDate;
    if (doc.expiryDate) attrs.ExpireDate = doc.expiryDate;
    if (doc.birthDate) attrs.BirthDate = doc.birthDate;
    if (doc.genderCode) attrs.GenderCode = doc.genderCode;

    return out;
  });
}
// ============================================================================
// Section 9 — CustLoyalty  (array)
//
//   membershipLevelTypeCode resolution:
//     caller provides it  → use as-is   (ST for "GOLD", TI for "02", etc.)
//     caller omits it     → auto: numeric → TI, text → ST
// ============================================================================

function buildLoyaltyPrograms(programs?: LoyaltyProgram[]): any[] | undefined {
  if (!programs || programs.length === 0) return undefined;

  return programs.map((loyalty, index) => {
    const attrs: any = {
      VendorCode: loyalty.programId,
      VendorTypeCode: loyalty.vendorType || "AL",
      MembershipID: loyalty.membershipId,
      DisplaySequenceNo: String(loyalty.displaySequenceNo || index + 1),
      OrderSequenceNo: String(loyalty.orderSequenceNo || index + 1),
    };

    if (loyalty.programTypeCode) {
      attrs.ProgramTypeCode = loyalty.programTypeCode;
    }

    const out: any = { $: attrs };

    if (loyalty.givenName) out.GivenName = loyalty.givenName;
    if (loyalty.middleName) out.MiddleName = loyalty.middleName;
    if (loyalty.surName) out.SurName = loyalty.surName;

    // 🚫 DO NOT send MembershipLevel for Airline FT programs
    const isAirlineFT =
      attrs.VendorTypeCode === "AL" && attrs.ProgramTypeCode === "FT";

    if (loyalty.membershipLevel && !isAirlineFT) {
      const levelTypeCode =
        loyalty.membershipLevelTypeCode ||
        (/^\d+$/.test(loyalty.membershipLevel) ? "TI" : "ST");

      const levelAttrs: any = {
        MembershipLevelValue: loyalty.membershipLevel,
        MembershipLevelTypeCode: levelTypeCode,
      };

      if (loyalty.allianceCode) {
        levelAttrs.AllianceCode = loyalty.allianceCode;
      }
      if (loyalty.allianceLevelValue) {
        levelAttrs.AllianceLevelValue = loyalty.allianceLevelValue;
      }

      out.MembershipLevel = { $: levelAttrs };
    }

    // CustLoyaltyTotals (safe)
    if (loyalty.accountBalance || loyalty.membershipStartDate) {
      const totals: any = {};
      if (loyalty.accountBalance) {
        totals.AccountBalance = loyalty.accountBalance;
      }
      if (loyalty.membershipStartDate) {
        totals.MembershipStartDate = loyalty.membershipStartDate;
      }
      out.CustLoyaltyTotals = { $: totals };
    }

    return out;
  });
}
// ============================================================================
// Section 10 — Customer top-level attributes
// ============================================================================

function buildCustomerAttributes(
  customer?: Customer & {
    redressNumber?: string;
    knownTravelerNumber?: string;
  },
): any | undefined {
  if (!customer) return undefined;

  const attrs: any = {};
  if (customer.birthDate) attrs.BirthDate = customer.birthDate;
  if (customer.countryOfResidence)
    attrs.CountryOfResidence = customer.countryOfResidence;
  if (customer.nationalityCode)
    attrs.NationalityCode = customer.nationalityCode;
  if (customer.genderCode) attrs.GenderCode = customer.genderCode;
  if (customer.maritalStatusCode)
    attrs.MaritalStatusCode = customer.maritalStatusCode;
  if (customer.knownTravelerNumber)
    attrs.KnownTravelerNumber = customer.knownTravelerNumber;
  if (customer.redressNumber) attrs.RedressNumber = customer.redressNumber;
  return Object.keys(attrs).length ? attrs : undefined;
}

// ============================================================================
// Section 11 — AirlinePref
// ============================================================================

function buildAirlinePreferences(prefs?: AirlinePreference[]): any | undefined {
  if (!prefs || prefs.length === 0) return undefined;

  const airlinePref: any = { $: { TripTypeCode: "AZ" } };

  const seatPrefs = prefs.filter((p) => p.seatPreference);
  if (seatPrefs.length > 0) {
    airlinePref.AirlineSeatPref = seatPrefs.map((pref, i) => ({
      $: {
        PreferLevelCode: mapPreferLevel(pref.preferLevel),
        DisplaySequenceNo: String(i + 1),
        OrderSequenceNo: String(i + 1),
      },
      SeatInfo: {
        $: {
          SeatPreferenceCode: pref.seatPreference,
          ...(pref.airlineCode && { VendorCode: pref.airlineCode }),
        },
      },
    }));
  }

  const cabinPrefs = prefs.filter((p) => p.cabinPreference);
  if (cabinPrefs.length > 0) {
    airlinePref.AirlineCabinPref = cabinPrefs.map((pref, i) => ({
      $: {
        PreferLevelCode: mapPreferLevel(pref.preferLevel),
        DisplaySequenceNo: String(i + 1),
        OrderSequenceNo: String(i + 1),
      },
      CabinInfo: {
        $: {
          CabinNameCode: pref.cabinPreference,
          ...(pref.airlineCode && { VendorCode: pref.airlineCode }),
        },
      },
    }));
  }

  const mealPrefs = prefs.filter((p) => p.mealPreference);
  if (mealPrefs.length > 0) {
    airlinePref.AirlineMealPref = mealPrefs.map((pref, i) => ({
      $: {
        PreferLevelCode: mapPreferLevel(pref.preferLevel),
        DisplaySequenceNo: String(i + 1),
        OrderSequenceNo: String(i + 1),
      },
      MealInfo: {
        $: {
          MealTypeCode: pref.mealPreference,
          ...(pref.airlineCode && { VendorCode: pref.airlineCode }),
        },
      },
    }));
  }

  const airlinePrefs = prefs.filter((p) => p.airlineCode);
  if (airlinePrefs.length > 0) {
    airlinePref.PreferredAirlines = airlinePrefs.map((pref, i) => ({
      $: {
        VendorCode: pref.airlineCode,
        PreferLevelCode: mapPreferLevel(pref.preferLevel),
        DisplaySequenceNo: String(i + 1),
        OrderSequenceNo: String(i + 1),
        ...(pref.exclude !== undefined && { Exclude: String(pref.exclude) }),
        ...(pref.orderPreferenceNo && {
          OrderPreferenceNo: String(pref.orderPreferenceNo),
        }),
      },
    }));
  }

  return airlinePref;
}

// ============================================================================
// Section 12 — HotelPref
// ============================================================================

function buildHotelPreferences(prefs?: HotelPreference[]): any | undefined {
  if (!prefs || prefs.length === 0) return undefined;

  return {
    $: { TripTypeCode: "AZ" },
    PreferredHotel: prefs.map((pref, index) => {
      const attrs: any = {
        PreferLevelCode: mapPreferLevel(pref.preferLevel),
        DisplaySequenceNo: String(index + 1),
        OrderSequenceNo: String(index + 1),
      };
      if (pref.exclude !== undefined) attrs.Exclude = String(pref.exclude);
      if (pref.orderPreferenceNo)
        attrs.OrderPreferenceNo = String(pref.orderPreferenceNo);
      if (pref.chainCode) {
        attrs.HotelChainCode = pref.chainCode;
        attrs.HotelVendorCode = pref.chainCode;
      }
      if (pref.hotelName) attrs.HotelName = pref.hotelName;
      if (pref.roomType) attrs.RoomTypeCode = pref.roomType;
      if (pref.smoking !== undefined)
        attrs.SmokingCode = pref.smoking ? "Y" : "N";
      if (pref.bedType) attrs.BedTypeCode = pref.bedType;

      const hotel: any = { $: attrs };

      if (pref.maxRoomRate || pref.currencyCode) {
        const rateAttrs: any = { CurrencyCode: pref.currencyCode || "USD" };
        if (pref.maxRoomRate) rateAttrs.MaxRoomRate = pref.maxRoomRate;
        hotel.HotelRate = { $: rateAttrs };
      }

      return hotel;
    }),
  };
}

// ============================================================================
// Section 13 — VehicleRentalPref
// ============================================================================

function buildVehicleRentalPreferences(
  prefs?: VehicleRentalPreference[],
): any | undefined {
  if (!prefs || prefs.length === 0) return undefined;

  return {
    $: { TripTypeCode: "AZ" },
    PreferredVehicleVendors: prefs.map((pref, index) => {
      const attrs: any = {
        PreferLevelCode: mapPreferLevel(pref.preferLevel),
        DisplaySequenceNo: String(index + 1),
        OrderSequenceNo: String(index + 1),
      };

      if (pref.exclude !== undefined) attrs.Exclude = String(pref.exclude);
      if (pref.orderPreferenceNo)
        attrs.OrderPreferenceNo = String(pref.orderPreferenceNo);
      if (pref.vendorCode) attrs.VendorCode = pref.vendorCode;
      if (pref.vehicleType) attrs.VehicleTypeCode = pref.vehicleType; // ✅ FLSZ lives here

      const vendor: any = { $: attrs };

      if (pref.maxRateAmount || pref.currencyCode) {
        vendor.VehicleRate = {
          $: {
            CurrencyCode: pref.currencyCode || "USD",
            ...(pref.maxRateAmount && { MaxRateAmount: pref.maxRateAmount }),
          },
        };
      }

      // 🚫 DO NOT add PseudoType when using FLSZ
      return vendor;
    }),
  };
}

// ============================================================================
// Section 14 — PrefCollections  (assembles 11 + 12 + 13)
// ============================================================================

function buildPrefCollections(preferences?: Preferences): any | undefined {
  if (!preferences) return undefined;

  const collections: any = {};

  const airline = buildAirlinePreferences(preferences.airlinePreferences);
  const hotel = buildHotelPreferences(preferences.hotelPreferences);
  const vehicle = buildVehicleRentalPreferences(
    preferences.vehicleRentalPreferences,
  );

  if (airline) collections.AirlinePref = airline;
  if (hotel) collections.HotelPref = hotel;
  if (vehicle) collections.VehicleRentalPref = vehicle;

  return Object.keys(collections).length ? collections : undefined;
}

// ============================================================================
// Section 15 — PriorityRemarks
// ============================================================================

function buildRemarks(remarks?: Remark[]): any | undefined {
  if (!remarks || remarks.length === 0) return undefined;

  return {
    PriorityRemarks: remarks.map((r) => ({
      $: {
        Text: r.key ? `${r.key}:${r.value}` : r.value,
        ...(r.categoryCode && { CategoryCode: r.categoryCode }),
      },
    })),
  };
}

// ============================================================================
// Section 16 — IgnoreSubjectArea
// ============================================================================

function buildIgnoreSubjectAreas(payload: UpdateProfilePayload): string[] {
  const ignore: SubjectAreaName[] = [];

  if (!payload.customer?.personName) ignore.push("PersonName");
  if (!payload.customer?.telephone) ignore.push("Telephone");
  if (!payload.customer?.email) ignore.push("Email");
  if (!payload.customer?.address) ignore.push("Address");
  if (!payload.customer?.paymentForms?.length) ignore.push("PaymentForm");
  if (!payload.customer?.emergencyContacts?.length)
    ignore.push("EmergencyContactPerson");
  if (!payload.customer?.documents?.length) ignore.push("Document");
  if (!payload.customer?.loyaltyPrograms?.length) ignore.push("CustLoyalty");
  if (!payload.preferences?.airlinePreferences?.length)
    ignore.push("AirlinePref");
  if (!payload.preferences?.hotelPreferences?.length) ignore.push("HotelPref");
  if (!payload.preferences?.vehicleRentalPreferences?.length)
    ignore.push("VehicleRentalPref");
  if (!payload.remarks?.length) {
    ignore.push("PriorityRemarks");
    ignore.push("Remark");
  }

  return [...new Set([...ignore, ...(payload.ignoreSubjectAreas || [])])];
}

// ============================================================================
// Section 17 — Main Assembler  (enforces Sabre element order)
//
//   Customer order:
//     attrs → PersonName → Telephone → Email → Address →
//     PaymentForm → EmergencyContactPerson → Document → CustLoyalty
//
//   Traveler order:
//     Customer → PrefCollections → TPA_Extensions
// ============================================================================

export function buildUpdateRequest(
  payload: UpdateProfilePayload,
  currentProfile?: { CreateDateTime?: string; UpdateDateTime?: string },
): any {
  const now = new Date().toISOString();
  const createDateTime = currentProfile?.CreateDateTime || now;

  const tpaIdentity = buildTpaIdentity(payload);

  // ── Customer ──
  const customer: any = {};

  const custAttrs = buildCustomerAttributes(payload.customer);
  if (custAttrs) customer.$ = custAttrs;

  const personName = buildPersonName(payload.customer?.personName);
  if (personName) customer.PersonName = personName;

  const telephone = buildTelephone(payload.customer?.telephone);
  if (telephone) customer.Telephone = telephone;

  const email = buildEmail(payload.customer?.email);
  if (email) customer.Email = email;

  const address = buildAddress(payload.customer?.address);
  if (address) customer.Address = address;

  const paymentForms = buildPaymentForms(payload.customer?.paymentForms);
  if (paymentForms) customer.PaymentForm = paymentForms;

  const emergencyContacts = buildEmergencyContacts(
    payload.customer?.emergencyContacts,
  );
  if (emergencyContacts) customer.EmergencyContactPerson = emergencyContacts;

  const documents = buildDocuments(payload.customer?.documents);
  if (documents) customer.Document = documents;

  const loyaltyPrograms = buildLoyaltyPrograms(
    payload.customer?.loyaltyPrograms,
  );
  if (loyaltyPrograms) customer.CustLoyalty = loyaltyPrograms;

  // ── Traveler ──
  const traveler: any = {};

  if (Object.keys(customer).length > 0) traveler.Customer = customer;

  const prefCollections = buildPrefCollections(payload.preferences);
  if (prefCollections) traveler.PrefCollections = prefCollections;

  const tpaExtensions = buildRemarks(payload.remarks);
  if (tpaExtensions) traveler.TPA_Extensions = tpaExtensions;

  // ── Profile ──
  const profile: any = {
    $: { CreateDateTime: createDateTime, UpdateDateTime: now },
    TPA_Identity: tpaIdentity,
  };
  if (Object.keys(traveler).length > 0) profile.Traveler = traveler;

  const ignoreAreas = buildIgnoreSubjectAreas(payload);
  if (ignoreAreas.length > 0)
    profile.IgnoreSubjectArea = { SubjectAreaName: ignoreAreas };

  // ── Root ──
  const root: any = {
    Sabre_OTA_ProfileUpdateRQ: {
      $: {
        Version: "6.99.2",
        Target: "Production",
        xmlns: "http://www.sabre.com/eps/schemas",
      },
      ProfileInfo: { Profile: profile },
    },
  };
  if (payload.ignoreTimeStampCheck)
    root.Sabre_OTA_ProfileUpdateRQ.$.IgnoreTimeStampCheck = "Y";

  return root;
}

// ============================================================================
// XML Generation
// ============================================================================

export function generateXML(requestObject: any): string {
  const builder = new Builder({
    xmldec: { version: "1.0", encoding: "UTF-8" },
    renderOpts: { pretty: true, indent: "  " },
  });
  return builder.buildObject(requestObject);
}

// ============================================================================
// Convenience exports
// ============================================================================

export function updateSabreProfile(
  payload: UpdateProfilePayload,
  currentProfile?: { CreateDateTime?: string; UpdateDateTime?: string },
): any {
  return buildUpdateRequest(payload, currentProfile);
}

export function updateSabreProfileToXML(
  payload: UpdateProfilePayload,
  currentProfile?: { CreateDateTime?: string; UpdateDateTime?: string },
): string {
  return generateXML(buildUpdateRequest(payload, currentProfile));
}
