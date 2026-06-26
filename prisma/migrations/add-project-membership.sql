CREATE TABLE IF NOT EXISTS `project_members` (
  `id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `project_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `project_members_project_id_user_id_key` (`project_id`, `user_id`),
  INDEX `project_members_user_id_idx` (`user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `project_members_project_id_fkey`
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_members_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
