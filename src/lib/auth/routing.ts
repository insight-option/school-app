import type { Role } from '../data/client';

/** Pure helpers for role → workspace routing (unit-tested). */
export const ROLE_PRECEDENCE: Role[] = ['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT'];

export type WorkspaceGroup = '(admin)' | '(teacher)' | '(driver)' | '(student)';

export function roleFromGroups(groups: readonly string[] | null | undefined): Role | null {
  if (!groups?.length) return null;
  for (const role of ROLE_PRECEDENCE) if (groups.includes(role)) return role;
  return null;
}

export function workspaceForRole(role: Role | null | undefined): WorkspaceGroup | null {
  switch (role) {
    case 'ADMIN':
      return '(admin)';
    case 'TEACHER':
      return '(teacher)';
    case 'DRIVER':
      return '(driver)';
    case 'STUDENT':
      return '(student)';
    default:
      return null;
  }
}

export function homeRouteForRole(role: Role | null | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/(admin)/dashboard';
    case 'TEACHER':
      return '/(teacher)/(tabs)/class';
    case 'DRIVER':
      return '/(driver)/(tabs)/trip';
    case 'STUDENT':
      return '/(student)/(tabs)/bus';
    default:
      return '/(auth)/sign-in';
  }
}

/** A user may only enter the route group of their own role. */
export function canAccessWorkspace(role: Role | null | undefined, group: string | undefined): boolean {
  if (!group) return true;
  const ws = workspaceForRole(role);
  const guarded: WorkspaceGroup[] = ['(admin)', '(teacher)', '(driver)', '(student)'];
  if (!guarded.includes(group as WorkspaceGroup)) return true;
  return ws === group;
}

/** Students must set a home location before entering the app. */
export function needsHomeLocation(role: Role | null | undefined, profile: { homeLocation?: { lat: number; lng: number } | null } | null | undefined): boolean {
  if (role !== 'STUDENT') return false;
  if (!profile) return false; // profile still loading → don't block
  return !profile.homeLocation;
}
