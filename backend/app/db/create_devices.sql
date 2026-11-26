CREATE TABLE devices (
    device_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    public_key_spki BLOB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP NULL DEFAULT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,

    PRIMARY KEY (device_id),
    KEY devices_user_id_index (user_id),

    CONSTRAINT devices_account_fk
        FOREIGN KEY (user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;