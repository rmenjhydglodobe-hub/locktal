CREATE TABLE IF NOT EXISTS chat_groups (
    group_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    created_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (group_id),
    KEY chat_groups_created_by_index (created_by),

    CONSTRAINT chat_groups_created_by_fk
        FOREIGN KEY (created_by) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_members (
    group_id BIGINT UNSIGNED NOT NULL,
    user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (group_id, user_id),
    KEY group_members_user_index (user_id),

    CONSTRAINT group_members_group_fk
        FOREIGN KEY (group_id) REFERENCES chat_groups (group_id)
        ON DELETE CASCADE,

    CONSTRAINT group_members_user_fk
        FOREIGN KEY (user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_messages (
    message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_id BIGINT UNSIGNED NOT NULL,
    sender_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (message_id),
    KEY group_messages_group_index (group_id, message_id),

    CONSTRAINT group_messages_group_fk
        FOREIGN KEY (group_id) REFERENCES chat_groups (group_id)
        ON DELETE CASCADE,

    CONSTRAINT group_messages_sender_fk
        FOREIGN KEY (sender_user_id) REFERENCES accounts (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
