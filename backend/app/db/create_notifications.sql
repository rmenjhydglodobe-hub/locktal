CREATE TABLE notifications (
    notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    message VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL DEFAULT NULL,

    PRIMARY KEY (notification_id),
    KEY notifications_user_index (user_id, created_at),

    CONSTRAINT notifications_account_fk
        FOREIGN KEY (user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;