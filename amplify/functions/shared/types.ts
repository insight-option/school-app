/**
 * Event shape Amplify Gen 2 passes to `a.handler.function` Lambdas (see the generated VTL:
 * `{ typeName, fieldName, arguments, identity, source, request, prev }`). `info` is only present
 * for direct Lambda resolvers, so operations are resolved through `opName()`.
 */
export type AppSyncIdentity = {
  sub: string;
  username: string;
  groups?: string[] | null;
  claims?: Record<string, unknown>;
  sourceIp?: string[];
  issuer?: string;
} | null;

export type AppSyncEvent<TArgs = Record<string, unknown>> = {
  typeName?: string;
  fieldName?: string;
  arguments: TArgs;
  identity: AppSyncIdentity;
  source?: unknown;
  request?: { headers: Record<string, string> };
  prev?: unknown;
  info?: {
    fieldName: string;
    parentTypeName: string;
    variables: Record<string, unknown>;
    selectionSetList: string[];
  };
  stash?: Record<string, unknown>;
};

/** Name of the custom query/mutation being executed. */
export function opName(event: AppSyncEvent<unknown>): string {
  return event.fieldName ?? event.info?.fieldName ?? '';
}

export class HandlerError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'BAD_REQUEST',
  ) {
    super(message);
    this.name = 'HandlerError';
  }
}

export function requireIdentity(event: AppSyncEvent<unknown>) {
  if (!event.identity || !event.identity.sub) {
    throw new HandlerError('Not authenticated', 'UNAUTHORIZED');
  }
  const groups = event.identity.groups ?? [];
  return {
    sub: event.identity.sub,
    username: event.identity.username,
    groups,
    isAdmin: groups.includes('ADMIN'),
    isTeacher: groups.includes('TEACHER'),
    isDriver: groups.includes('DRIVER'),
    isStudent: groups.includes('STUDENT'),
    schoolId: (event.identity.claims?.['custom:schoolId'] as string | undefined) ?? 'default',
  };
}

export type Caller = ReturnType<typeof requireIdentity>;

export function requireAdmin(event: AppSyncEvent<unknown>): Caller {
  const c = requireIdentity(event);
  if (!c.isAdmin) throw new HandlerError('Admin only', 'FORBIDDEN');
  return c;
}
