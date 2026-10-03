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
