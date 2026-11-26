CREATE TABLE request_limits (
    sender_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recipient_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    decline_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    blocked_until TIMESTAMP NULL DEFAULT NULL,

    PRIMARY KEY (sender_user_id, recipient_user_id),

    CONSTRAINT request_limits_different_users
        CHECK (sender_user_id <> recipient_user_id),

    CONSTRAINT request_limits_sender_fk
        FOREIGN KEY (sender_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE,

    CONSTRAINT request_limits_recipient_fk
        FOREIGN KEY (recipient_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;