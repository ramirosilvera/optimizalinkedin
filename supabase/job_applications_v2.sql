-- Migration: add job application rich fields to postulaciones
-- Run in Supabase SQL Editor

ALTER TABLE postulaciones
  ADD COLUMN IF NOT EXISTS job_description  text,
  ADD COLUMN IF NOT EXISTS cover_letter     text,
  ADD COLUMN IF NOT EXISTS ats_keywords     text,
  ADD COLUMN IF NOT EXISTS seniority        text,
  ADD COLUMN IF NOT EXISTS adaptation_notes text;
