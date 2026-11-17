-- AlterTable
ALTER TABLE `job_history` ADD COLUMN `time_range_start` VARCHAR(5) NULL,
    ADD COLUMN `time_range_end` VARCHAR(5) NULL,
    ADD COLUMN `keep_watching` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `notify_status` VARCHAR(20) NULL,
    ADD COLUMN `notified_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `last_checked_at` DATETIME(3) NULL;
