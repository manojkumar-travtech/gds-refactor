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

// --chnageset: 10-02-2026
CREATE TABLE IF NOT EXISTS bookings.pnr_passengers (
    id SERIAL PRIMARY KEY,

    -- FK must match bookings.pnrs.id (INTEGER)
    pnr_id INTEGER NOT NULL
        REFERENCES bookings.pnrs(id) ON DELETE CASCADE,

    -- GDS passenger reference (NOT a UUID)
    passenger_id VARCHAR(50) NOT NULL, -- e.g. "60", "64"

    -- Profile reference (UUID is correct here)
    profile_id UUID
        REFERENCES profiles.profiles(id) ON DELETE SET NULL,

    -- Basic Info
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255),
    email_source VARCHAR(100),
    email_extraction_success BOOLEAN DEFAULT false,

    -- Passenger Details
    passenger_type VARCHAR(10) DEFAULT 'ADT', -- ADT, CHD, INF
    is_primary BOOLEAN DEFAULT false,
    date_of_birth DATE,
    gender VARCHAR(10),

    -- GDS Profile Info
    gds_profile_id VARCHAR(50),

    -- Contact Information
    phones JSONB DEFAULT '[]'::jsonb,
    addresses JSONB DEFAULT '[]'::jsonb,

    -- Travel Documents
    passports JSONB DEFAULT '[]'::jsonb,
    visas JSONB DEFAULT '[]'::jsonb,

    -- Booking Details
    seats JSONB DEFAULT '[]'::jsonb,
    tickets JSONB DEFAULT '[]'::jsonb,
    special_requests JSONB DEFAULT '[]'::jsonb,
    frequent_flyer JSONB DEFAULT '[]'::jsonb,
    emergency_contacts JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE (pnr_id, passenger_id)
);
ALTER TABLE profiles.profiles
DROP CONSTRAINT profiles_user_id_fkey;

ALTER TABLE bookings.trips
DROP CONSTRAINT IF EXISTS trips_pnr_unique;

ALTER TABLE bookings.trips
ADD CONSTRAINT trips_pnr_id_key UNIQUE (pnr_id);