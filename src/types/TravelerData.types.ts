interface TravelerData {
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  dob?: string;
  passportNumber?: string;
  nationality?: string;
  title?: string;
  middleName?: string;
  middle_name?: string;
  frequentFlyerNumber?: string;
  knownTravelerNumber?: string;
  redressNumber?: string;
  gender?: string;
  isPrimary?: boolean;
  is_primary?: boolean;
  metadata?: Record<string, any>;
}

interface ProfileData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}
