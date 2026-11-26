ALTER TABLE accounts
  DROP INDEX unique_account_key_hash,
  CHANGE COLUMN account_key_hash encrypted_account_key_hash VARBINARY(64) NOT NULL;

ALTER TABLE accounts
  ADD KEY idx_accounts_display_name (display_name);