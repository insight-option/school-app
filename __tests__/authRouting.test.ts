import { canAccessWorkspace, homeRouteForRole, needsHomeLocation, roleFromGroups, workspaceForRole } from '../src/lib/auth/routing';

describe('auth routing', () => {
  it('derives the role from cognito groups with ADMIN precedence', () => {
    expect(roleFromGroups(['STUDENT'])).toBe('STUDENT');
    expect(roleFromGroups(['TEACHER', 'ADMIN'])).toBe('ADMIN');
    expect(roleFromGroups(['DRIVER'])).toBe('DRIVER');
    expect(roleFromGroups([])).toBeNull();
    expect(roleFromGroups(undefined)).toBeNull();
    expect(roleFromGroups(['SOMETHING_ELSE'])).toBeNull();
  });

  it('maps roles to workspaces and home routes', () => {
    expect(workspaceForRole('ADMIN')).toBe('(admin)');
    expect(workspaceForRole('STUDENT')).toBe('(student)');
    expect(workspaceForRole(null)).toBeNull();
    expect(homeRouteForRole('DRIVER')).toBe('/(driver)/(tabs)/trip');
    expect(homeRouteForRole('TEACHER')).toBe('/(teacher)/(tabs)/class');
    expect(homeRouteForRole(null)).toBe('/(auth)/sign-in');
  });

  it('never lets a role open another workspace', () => {
    expect(canAccessWorkspace('STUDENT', '(student)')).toBe(true);
    expect(canAccessWorkspace('STUDENT', '(admin)')).toBe(false);
    expect(canAccessWorkspace('DRIVER', '(teacher)')).toBe(false);
    expect(canAccessWorkspace('ADMIN', '(admin)')).toBe(true);
    expect(canAccessWorkspace('ADMIN', 'chat')).toBe(true); // shared routes
    expect(canAccessWorkspace(null, '(student)')).toBe(false);
  });

  it('forces home-location onboarding for students without a pin only', () => {
    expect(needsHomeLocation('STUDENT', { homeLocation: null })).toBe(true);
    expect(needsHomeLocation('STUDENT', { homeLocation: { lat: 1, lng: 2 } })).toBe(false);
    expect(needsHomeLocation('STUDENT', null)).toBe(false); // still loading → don't block
    expect(needsHomeLocation('TEACHER', { homeLocation: null })).toBe(false);
  });
});
