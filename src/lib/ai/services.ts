// The single switch point for service functions. Next.js runtime uses the real database-backed
// services; standalone contract checks (tsx, with no NODE_ENV) use the in-memory fake services.
import * as read from "@/services/read";
import * as write from "@/services/write";
import * as fake from "./dev/fake-services";
import * as memory from "./core/memory";

const realServices = { ...read, ...write, ...memory };
const useRealServices = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production";
const activeServices: typeof fake = useRealServices
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
export const getStudentMemory = activeServices.getStudentMemory;
export const saveStudentMemory = activeServices.saveStudentMemory;
export const rescheduleSession = activeServices.rescheduleSession;
