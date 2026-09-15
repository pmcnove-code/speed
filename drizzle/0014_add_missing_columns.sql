-- Add missing voice_id column to personas table
ALTER TABLE personas ADD COLUMN IF NOT EXISTS voice_id VARCHAR(160);

-- Add missing airtable_sent_at column to batches table
ALTER TABLE batches ADD COLUMN IF NOT EXISTS airtable_sent_at TIMESTAMP;
