/**
 * Interface for creating a Sabre profile
 */
export interface CreateProfileRequest {
  // Required fields
  givenName: string;
  surname: string;

  // Optional contact information
  phoneNumber?: string;
  email?: string;

  // Optional address information
  address?: string;
  city?: string;
  postalCode?: string;
  stateCode?: string;
  countryCode?: string; // Default: "US"

  // Optional configuration
  primaryLanguage?: string; // Default: "EN-US"
  clientCode?: string; // Default: "TN"
  profileStatusCode?: string; // Default: "AC"
}

/**
 * Response from profile creation
 */
export interface CreateProfileResponse {
  success: boolean;
  data?: {
    uniqueId: string;
    message: string;
  };
  error?: string;
}

/**
 * Validation helper for profile data
 */
export class ProfileValidator {
  /**
   * Validates profile creation request
   */
  static validateCreateProfile(profile: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check required fields
    if (!profile.givenName || typeof profile.givenName !== "string") {
      errors.push("givenName is required and must be a string");
    }

    if (!profile.surname || typeof profile.surname !== "string") {
      errors.push("surname is required and must be a string");
    }

    // Validate optional fields if provided
    if (profile.email && !this.isValidEmail(profile.email)) {
      errors.push("email must be a valid email address");
    }

    if (profile.phoneNumber && !this.isValidPhoneNumber(profile.phoneNumber)) {
      errors.push("phoneNumber should include country code (e.g., +1234567890)");
    }

    if (profile.countryCode && !this.isValidCountryCode(profile.countryCode)) {
      errors.push("countryCode must be a 2-letter ISO country code");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Basic email validation
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Basic phone number validation (checks for + prefix)
   */
  private static isValidPhoneNumber(phone: string): boolean {
    return phone.startsWith("+") && phone.length >= 10;
  }

  /**
   * Country code validation (2 letters)
   */
  private static isValidCountryCode(code: string): boolean {
    return /^[A-Z]{2}$/.test(code);
  }
}

/**
 * Example usage in your service or controller:
 * 
 * const validation = ProfileValidator.validateCreateProfile(req.body);
 * if (!validation.isValid) {
 *   return res.status(400).json({
 *     success: false,
 *     errors: validation.errors
 *   });
 * }
 */