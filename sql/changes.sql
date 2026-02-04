ALTER TABLE core.users
ADD CONSTRAINT users_org_email_unique
UNIQUE (organization_id, email);