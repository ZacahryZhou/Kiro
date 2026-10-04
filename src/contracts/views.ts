export type CourseView = {
  id: string;
  name: string;
  subject: string;
  type: "ONE_ON_ONE" | "SMALL_CLASS";
  location?: string;
  description?: string;
  teacherName: string;
  studentCount: number;
};
export type SessionView = {
  id: string;
  courseId: string;
  courseName: string;
  startAt: string;
  durationMin: number;
  location?: string;
  linkUrl?: string;
  status: "SCHEDULED" | "RESCHEDULED" | "CANCELLED" | "COMPLETED";
  originalStartAt?: string;
};
export type StudentView = { id: string; name: string; email: string };
export type AttendanceView = {
  id: string;
  sessionId: string;
  courseId: string;
  sessionStartAt: string;
  studentId: string;
  studentName: string;
  status: "PRESENT" | "LEAVE" | "ABSENT";
  markedAt: string;
};
export type DeductionView = {
  id: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  amountCents: number;
  reason: "PRESENT" | "ABSENT";
  createdAt: string;
};
export type MaterialView = {
  id: string;
  unitId: string;
  title: string;
  kind: "TEXT" | "LINK";
  content?: string;
  url?: string;
};
export type UnitView = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  materials: MaterialView[];
};
export type ConflictView = {
  sessionId: string;
  courseName: string;
  startAt: string;
  durationMin: number;
  withStudentId?: string;
};

/** A student's leave or reschedule request. Approving or declining it never changes the schedule or attendance. */
export type StudentRequestView = {
  id: string;
  sessionId: string;
  courseId: string;
  courseName: string;
  sessionStartAt: string;
  studentId: string;
  studentName: string;
  kind: "LEAVE" | "RESCHEDULE";
  note?: string;
  preferredStartAt?: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  resolvedAt?: string;
};

/** A teacher's note on what a student worked on in one session. `note` is the teacher's private remark and is never shown to students. */
export type ProgressRecordView = {
  id: string;
  sessionId: string;
  courseId: string;
  courseName: string;
  sessionStartAt: string;
  studentId: string;
  studentName: string;
  goal: string;
  output: string;
  issue?: string;
  nextAction: "PRACTICE" | "REVIEW" | "EXTRA_MATERIAL" | "RECAP_NEXT";
  note?: string;
  updatedAt: string;
};
