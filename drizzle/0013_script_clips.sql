CREATE TABLE IF NOT EXISTS script_clips (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  clip_number VARCHAR(8) NOT NULL,
  duration VARCHAR(4) NOT NULL,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  estimated_time_sec NUMERIC NOT NULL,
  fill_ratio NUMERIC NOT NULL,
  generation_prompt TEXT NOT NULL,
  internal_breaks INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_script_clips_batch ON script_clips(batch_id);
CREATE INDEX IF NOT EXISTS idx_script_clips_clip_number ON script_clips(batch_id, clip_number);
