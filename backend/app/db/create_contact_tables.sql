CREATE TABLE user_blocks (
    blocker_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    blocked_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (blocker_user_id, blocked_user_id),
    KEY user_blocks_blocked_index (blocked_user_id),

    CONSTRAINT user_blocks_different_users
        CHECK (blocker_user_id <> blocked_user_id),

    CONSTRAINT user_blocks_blocker_fk
        FOREIGN KEY (blocker_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE,

    CONSTRAINT user_blocks_blocked_fk
        FOREIGN KEY (blocked_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;


CREATE TABLE message_requests (
    request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sender_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recipient_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    pair_low_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    pair_high_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL DEFAULT NULL,

    PRIMARY KEY (request_id),
    UNIQUE KEY message_requests_pair_unique (pair_low_id, pair_high_id),
    KEY message_requests_incoming_index
        (recipient_user_id, status, created_at),
    KEY message_requests_outgoing_index
        (sender_user_id, status, created_at),

    CONSTRAINT message_requests_different_users
        CHECK (sender_user_id <> recipient_user_id),

    CONSTRAINT message_requests_pair_order
        CHECK (
            pair_low_id = LEAST(sender_user_id, recipient_user_id)
            AND pair_high_id = GREATEST(sender_user_id, recipient_user_id)
        ),

    CONSTRAINT message_requests_sender_fk
        FOREIGN KEY (sender_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE,

    CONSTRAINT message_requests_recipient_fk
        FOREIGN KEY (recipient_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;