// Plain-English list of everything the agents can do, for the Agent Console. Plain data with no
// imports, so the browser can load it. A check (tools-check) fails if a tool is added or removed
// without updating this list, so what the console shows is always what the agents really have.

export type CatalogKind = "read" | "propose";
export type CatalogRole = "TEACHER" | "STUDENT";
export type CatalogEntry = { tool: string; title: string; summary: string; kind: CatalogKind; roles: CatalogRole[] };

const T: CatalogRole[] = ["TEACHER"];
const S: CatalogRole[] = ["STUDENT"];
const TS: CatalogRole[] = ["TEACHER", "STUDENT"];

export const TOOL_CATALOG: CatalogEntry[] = [
  // ----- look things up (nothing is ever changed) -----
  { tool: "getTeacherSchedule", title: "Look up the schedule", summary: "Sessions in any date range, plus the current time and the next class, worked out by code.", kind: "read", roles: T },
  { tool: "listMyCourses", title: "List my courses", summary: "The courses the teacher teaches, with student counts.", kind: "read", roles: T },
  { tool: "listMyStudents", title: "List my students", summary: "Enrolled students, for one course or all.", kind: "read", roles: T },
  { tool: "findMyStudent", title: "Find a student", summary: "Match a student by name or email among the teacher's own students only.", kind: "read", roles: T },
  { tool: "listAttendance", title: "Read attendance", summary: "Attendance records by course, student or session.", kind: "read", roles: T },
  { tool: "listDeductions", title: "Read lesson deductions", summary: "The lesson deductions that attendance produced.", kind: "read", roles: T },
  { tool: "getAttendanceTrends", title: "Attendance trends", summary: "Attendance rates computed by code. With fewer than three sessions it says there is not enough data.", kind: "read", roles: T },
  { tool: "checkConflicts", title: "Check for time conflicts", summary: "Whether a time overlaps the teacher's or any enrolled student's other sessions.", kind: "read", roles: T },
  { tool: "getCourseMaterials", title: "Read course materials", summary: "Units and materials of a course.", kind: "read", roles: T },
  { tool: "getStudentMemory", title: "Read private student notes", summary: "Availability and notes the teacher keeps about a student. Never visible to students.", kind: "read", roles: T },
  { tool: "listStudentRequests", title: "Review leave and time requests", summary: "Requests students sent. Teachers see their courses' requests; students see their own.", kind: "read", roles: TS },
  { tool: "listProgressRecords", title: "Read progress records", summary: "What each student worked on, session by session. Students never see the teacher's private note.", kind: "read", roles: TS },
  { tool: "listMyDashboardLayouts", title: "List home page layouts", summary: "The teacher's saved home page layouts.", kind: "read", roles: T },
  { tool: "listMyQuizzes", title: "List quizzes", summary: "Saved quizzes and whether students can see them. The answer key is left out.", kind: "read", roles: T },
  { tool: "getQuizResults", title: "Quiz results", summary: "Each student's latest and best score, the class average, who has not taken it and the most-missed questions.", kind: "read", roles: T },
  { tool: "listMyKnowledge", title: "List teaching notes", summary: "The notes the students' tutor teaches from.", kind: "read", roles: T },
  { tool: "getMyProfile", title: "Say who I am", summary: "The signed-in person's own name, role, courses and teachers or students.", kind: "read", roles: TS },
  { tool: "getStudentWorkspace", title: "Look up my schedule and attendance", summary: "The student's own courses, sessions and attendance, plus the next class.", kind: "read", roles: S },
  { tool: "answerFromCourseMaterials", title: "Answer from course materials", summary: "Answers with quotes that code checks against the source, or says it could not find the answer.", kind: "read", roles: S },
  { tool: "explainWithTeacherNotes", title: "Explain like my teacher", summary: "A step-by-step explanation from the teacher's notes and the course materials, with verified sources.", kind: "read", roles: S },

  // ----- prepare a change (saved as a proposal; nothing changes until a person confirms) -----
  { tool: "proposeMarkAttendance", title: "Take attendance", summary: "Present, leave or absent for every student of a session, with the deductions worked out by code.", kind: "propose", roles: T },
  { tool: "proposeCreateCourse", title: "Create a course", summary: "A new course, optionally with students enrolled.", kind: "propose", roles: T },
  { tool: "proposeCreateSessions", title: "Schedule sessions", summary: "Weekly sessions with conflicts checked first. One clash blocks the whole batch.", kind: "propose", roles: T },
  { tool: "proposeReschedule", title: "Reschedule a session", summary: "Move a session to a new time, with the old and new time shown.", kind: "propose", roles: T },
  { tool: "proposeAddStudent", title: "Add a student to a course", summary: "Enrol an existing student, matched only among the teacher's own students.", kind: "propose", roles: T },
  { tool: "proposeAddContent", title: "Add course content", summary: "A unit with text or link materials from what the teacher pasted.", kind: "propose", roles: T },
  { tool: "proposeLessonPrep", title: "Prepare a lesson", summary: "A handout draft and five practice questions, saved as course content.", kind: "propose", roles: T },
  { tool: "proposeProgressRecord", title: "Record progress", summary: "Goal, what the student produced, difficulty and next step, from the teacher's own words.", kind: "propose", roles: T },
  { tool: "proposeAddStudentNote", title: "Remember something about a student", summary: "A private note or availability, used only as a reference when scheduling.", kind: "propose", roles: T },
  { tool: "proposeQuiz", title: "Write a quiz", summary: "Code plans the mix of types and difficulties; only questions backed by a word-for-word quote are kept.", kind: "propose", roles: T },
  { tool: "proposeKnowledge", title: "Save teaching notes", summary: "Structure the teacher's dictated notes without adding facts.", kind: "propose", roles: T },
  { tool: "proposeKnowledgeFromMaterials", title: "Build notes from materials", summary: "Draft teaching notes from uploaded materials, kept only where the quote is in the source.", kind: "propose", roles: T },
  { tool: "proposeDashboardLayout", title: "Design the home page", summary: "Pick widgets, colours and motion; code places them on the grid.", kind: "propose", roles: T },
  { tool: "proposeStudentRequest", title: "Ask for leave or another time", summary: "A note to the teacher, sent only after the student confirms. It never changes the schedule.", kind: "propose", roles: S },
];

export const catalogFor = (role: CatalogRole, kind: CatalogKind) => TOOL_CATALOG.filter((entry) => entry.kind === kind && entry.roles.includes(role));
