-- Profile picture for an account (the same key is stored on each platform row of the account).
ALTER TABLE accounts ADD COLUMN avatar_key TEXT;
