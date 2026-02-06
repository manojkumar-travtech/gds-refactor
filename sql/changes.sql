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