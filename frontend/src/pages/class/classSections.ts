import type { IconName } from '../../components/icons';

export type ClassSectionId =
  | 'materials'
  | 'schedule'
  | 'quizzes'
  | 'assignments'
  | 'grades'
  | 'students'
  | 'attendance';

export const CLASS_SECTIONS: ClassSectionId[] = [
  'materials',
  'schedule',
  'quizzes',
  'assignments',
  'grades',
  'students',
  'attendance',
];

/** Legacy `?tab=` values mapped to path segments. */
export const LEGACY_TAB_TO_SECTION: Record<string, ClassSectionId> = {
  materials: 'materials',
  schedule: 'schedule',
  quizzes: 'quizzes',
  submissions: 'assignments',
  grades: 'grades',
  roster: 'students',
  attendance: 'attendance',
};

export function isClassSection(value: string | undefined): value is ClassSectionId {
  return !!value && CLASS_SECTIONS.includes(value as ClassSectionId);
}

export const sectionMeta: Record<
  ClassSectionId,
  {
    label: string;
    icon: IconName;
    tone: string;
    hint: string;
    staffOnly?: boolean;
  }
> = {
  materials: {
    label: 'Materials',
    icon: 'classes',
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    hint: 'Notes, PDFs, and study resources',
  },
  schedule: {
    label: 'Schedules',
    icon: 'live',
    tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    hint: 'Upcoming sessions and meeting links',
  },
  quizzes: {
    label: 'Quizzes',
    icon: 'quiz',
    tone: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
    hint: 'Assessments, attempts, and results',
  },
  assignments: {
    label: 'Assignments',
    icon: 'note',
    tone: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    hint: 'Uploads, feedback, and marking flow',
  },
  grades: {
    label: 'Grades',
    icon: 'chart',
    tone: 'bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300',
    hint: 'Performance and gradebook view',
  },
  students: {
    label: 'Students',
    icon: 'users',
    tone: 'bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
    hint: 'Roster, approvals, and class members',
    staffOnly: true,
  },
  attendance: {
    label: 'Attendance',
    icon: 'note',
    tone: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
    hint: 'Mark presence for class sessions',
    staffOnly: true,
  },
};
