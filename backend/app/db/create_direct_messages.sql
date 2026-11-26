CREATE TABLE direct_messages (
    message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sender_user_id VARCHAR(32)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recipient_user_id VARCHAR(32)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (message_id),
    KEY direct_messages_sender_recipient_index
        (sender_user_id, recipient_user_id, message_id),
    KEY direct_messages_recipient_sender_index
        (recipient_user_id, sender_user_id, message_id),

    CONSTRAINT direct_messages_sender_fk
        FOREIGN KEY (sender_user_id)
        REFERENCES accounts (user_id) ON DELETE CASCADE,

    CONSTRAINT direct_messages_recipient_fk
        FOREIGN KEY (recipient_user_id)
        REFERENCES accounts (user_id) ON DELETE CASCADE,

    CONSTRAINT direct_messages_different_users
        CHECK (sender_user_id <> recipient_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;