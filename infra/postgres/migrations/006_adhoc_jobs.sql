ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_type_check
  CHECK (type IN ('single', 'planner-reviewer', 'adhoc'));
