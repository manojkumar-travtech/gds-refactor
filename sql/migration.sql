BEGIN;

---------------------------------------------------
-- 1. CORE USERS (Org + Email unique)
---------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS users_org_email_unique
ON core.users (organization_id, email);

---------------------------------------------------
-- 2. ADD UPDATED_AT COLUMNS
---------------------------------------------------
ALTER TABLE profiles.phones
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.emails
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.addresses
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

---------------------------------------------------
-- 3. ADD DELETED_AT COLUMNS (Soft Deletes)
---------------------------------------------------
ALTER TABLE profiles.loyalty_programs
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.emergency_contacts
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.travel_documents
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.payment_methods
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.addresses
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.emails
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE profiles.phones
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

---------------------------------------------------
-- 4. UNIQUE CONSTRAINTS (PARTIAL UNIQUE INDEXES)
---------------------------------------------------

-- Emergency Contacts
CREATE UNIQUE INDEX IF NOT EXISTS unique_emergency_contact
ON profiles.emergency_contacts (profile_id, name, phone)
WHERE deleted_at IS NULL;

-- Loyalty Programs
CREATE UNIQUE INDEX IF NOT EXISTS unique_loyalty_program
ON profiles.loyalty_programs (profile_id, provider_code, member_number)
WHERE deleted_at IS NULL;

-- Travel Documents
CREATE UNIQUE INDEX IF NOT EXISTS unique_travel_document
ON profiles.travel_documents (profile_id, type, document_number)
WHERE deleted_at IS NULL;

-- Payment Methods
CREATE UNIQUE INDEX IF NOT EXISTS unique_payment_method
ON profiles.payment_methods (profile_id, card_last_four, card_type)
WHERE deleted_at IS NULL;

-- Addresses
CREATE UNIQUE INDEX IF NOT EXISTS unique_address
ON profiles.addresses (profile_id, type, line1)
WHERE deleted_at IS NULL;

-- Emails
CREATE UNIQUE INDEX IF NOT EXISTS unique_profile_email
ON profiles.emails (profile_id, address)
WHERE deleted_at IS NULL;

-- Phones
CREATE UNIQUE INDEX IF NOT EXISTS unique_phone
ON profiles.phones (profile_id, number)
WHERE deleted_at IS NULL;

---------------------------------------------------
-- 5. PERFORMANCE INDEXES FOR ACTIVE RECORDS
---------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_deleted_at
ON profiles.loyalty_programs (profile_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_deleted_at
ON profiles.emergency_contacts (profile_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_travel_documents_deleted_at
ON profiles.travel_documents (profile_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_methods_deleted_at
ON profiles.payment_methods (profile_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at
ON profiles.addresses (profile_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emails_deleted_at
ON profiles.emails (profile_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_phones_deleted_at
ON profiles.phones (profile_id)
WHERE deleted_at IS NULL;

COMMIT;

// --chnageset: 09-02-2026
DROP VIEW IF EXISTS reporting.trip_summary CASCADE;

ALTER TABLE bookings.trips
ALTER COLUMN status TYPE TEXT
USING status::text;

ALTER TABLE bookings.trips
DROP CONSTRAINT trips_user_id_fkey;

ALTER TABLE bookings.trip_travelers
ADD COLUMN user_id UUID;

ALTER TABLE bookings.trip_travelers
ADD CONSTRAINT trip_travelers_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES core.users(id);

ALTER TABLE bookings.trip_travelers
ADD CONSTRAINT trip_travelers_trip_id_user_id_uniq
UNIQUE (trip_id, user_id);

ALTER TABLE bookings.trip_travelers
ALTER COLUMN profile_id DROP NOT NULL;

-- Migration: Create trip_passengers table
-- This table stores ALL passenger information from PNR, regardless of whether they have user accounts

CREATE TABLE IF NOT EXISTS bookings.trip_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES bookings.trips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES core.users(id) ON DELETE SET NULL, -- nullable - not all passengers have accounts
  
  -- Passenger details from PNR
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  passenger_type VARCHAR(10), -- ADT, CHD, INF
  date_of_birth DATE,
  gender VARCHAR(10),
  title VARCHAR(20),
  
  -- Contact info
  emails TEXT[],
  phones JSONB,
  addresses JSONB,
  
  -- Travel documents
  passport_info JSONB,
  visa_info JSONB,
  
  -- PNR identifiers
  pnr_passenger_id VARCHAR(50),
  name_id VARCHAR(50),
  name_assoc_id VARCHAR(50),
  element_id VARCHAR(50),
  
  -- Seat assignments (array of seat info for all flights)
  seat_assignments JSONB,
  
  -- Frequent flyer
  frequent_flyer JSONB,
  
  -- Special requests
  special_requests JSONB,
  
  -- Metadata
  is_primary BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(trip_id, pnr_passenger_id)
);

-- Indexes
CREATE INDEX idx_trip_passengers_trip_id ON bookings.trip_passengers(trip_id);
CREATE INDEX idx_trip_passengers_user_id ON bookings.trip_passengers(user_id);
CREATE INDEX idx_trip_passengers_email ON bookings.trip_passengers USING GIN(emails);
CREATE INDEX idx_trip_passengers_is_primary ON bookings.trip_passengers(is_primary) WHERE is_primary = true;

-- Comment
COMMENT ON TABLE bookings.trip_passengers IS 'Stores all passenger information from PNR, including those without user accounts';
COMMENT ON COLUMN bookings.trip_passengers.user_id IS 'Reference to user account if passenger has one (nullable)';
COMMENT ON COLUMN bookings.trip_passengers.pnr_passenger_id IS 'Unique passenger ID from PNR XML';