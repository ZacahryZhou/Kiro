// The single switch point for service functions. Next.js runtime uses the real database-backed
// services; standalone contract checks (tsx, with no NODE_ENV) use the in-memory fake services.
import * as read from "@/services/read";
import * as write from "@/services/write";
import * as dashboard from "@/services/dashboard";
import * as quiz from "@/services/quiz";
import * as knowledge from "@/services/knowledge";
import * as fake from "./dev/fake-services";
import * as memory from "./core/memory";
import * as profile from "./core/profile";
import { useRealBackend } from "./runtime";

const realServices = { ...read, ...write, ...dashboard, ...quiz, ...knowledge, ...memory, ...profile };
const activeServices: typeof fake = useRealBackend
  ? realServices as unknown as typeof fake
  : fake;

export const listMyCourses = activeServices.listMyCourses;
export const getTeacherSchedule = activeServices.getTeacherSchedule;
export const listMyStudents = activeServices.listMyStudents;
export const getCourseMaterials = activeServices.getCourseMaterials;
export const getStudentWorkspace = activeServices.getStudentWorkspace;
export const listAttendance = activeServices.listAttendance;
export const listDeductions = activeServices.listDeductions;
export const checkConflicts = activeServices.checkConflicts;
export const createCourse = activeServices.createCourse;
export const addExistingStudentToCourse = activeServices.addExistingStudentToCourse;
export const createSessions = activeServices.createSessions;
export const confirmAttendance = activeServices.confirmAttendance;
export const createCourseUnit = activeServices.createCourseUnit;
export const addMaterial = activeServices.addMaterial;
export const getMyProfile = activeServices.getMyProfile;
export const getStudentMemory = activeServices.getStudentMemory;
export const saveStudentMemory = activeServices.saveStudentMemory;
export const rescheduleSession = activeServices.rescheduleSession;
export const submitStudentRequest = activeServices.submitStudentRequest;
export const listStudentRequests = activeServices.listStudentRequests;
export const resolveStudentRequest = activeServices.resolveStudentRequest;
export const saveProgressRecord = activeServices.saveProgressRecord;
export const listProgressRecords = activeServices.listProgressRecords;
export const listMyLayouts = activeServices.listMyLayouts;
export const getActiveLayout = activeServices.getActiveLayout;
export const saveDashboardLayout = activeServices.saveDashboardLayout;
export const createQuiz = activeServices.createQuiz;
export const listMyQuizzes = activeServices.listMyQuizzes;
export const saveKnowledgeEntries = activeServices.saveKnowledgeEntries;
export const listMyKnowledge = activeServices.listMyKnowledge;
export const listKnowledgeForStudent = activeServices.listKnowledgeForStudent;
