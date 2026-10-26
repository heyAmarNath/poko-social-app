-- People can be deleted. A deleted person is hidden everywhere and can't sign in, but stays in the
-- table so finished posts keep their name. Their email is freed, so they can be added again later.
ALTER TABLE profiles ADD COLUMN deleted_at INTEGER;
DROP INDEX ux_profiles_email;
CREATE UNIQUE INDEX ux_profiles_email ON profiles(email COLLATE NOCASE) WHERE deleted_at IS NULL;
