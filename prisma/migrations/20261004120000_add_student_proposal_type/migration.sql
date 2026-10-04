-- Allow proposals that add an existing student to an existing course.
ALTER TYPE "ProposalType" ADD VALUE IF NOT EXISTS 'ADD_STUDENT';
