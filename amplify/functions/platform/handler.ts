import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { getDataClient, type DataEnv } from '../shared/data';
import { HandlerError, isIamCaller, opName, requireIdentity, type AppSyncEvent } from '../shared/types';
import { deleteVenue, registerBusiness, registerCustomer, saveBusinessProfile, saveVenue } from './business';
import { cancelBooking, createBooking, respondBooking, venueAvailability } from './bookings';
import { ownerDeleteTenant, ownerListUsers, ownerOverview, ownerSetTenantStatus, ownerUserAction } from './owner';

// Populated by Amplify (USER_POOL_ID from backend.ts); typed here like the other functions.
const env = process.env as unknown as DataEnv & { USER_POOL_ID: string };
const cognito = new CognitoIdentityProviderClient({});

type Args = Record<string, unknown>;

export const handler = async (event: AppSyncEvent<Args>) => {
  const op = opName(event);
  const args = event.arguments as never;
  try {
    const client = await getDataClient(env);
    // Guest-callable (identity pool) operations first.
    if (op === 'venueAvailability') return await venueAvailability(client, args);
    if (isIamCaller(event)) throw new HandlerError('Sign in first', 'UNAUTHORIZED');

    const identity = requireIdentity(event);
    const deps = { client, cognito, userPoolId: env.USER_POOL_ID };
    const isOwner = identity.groups.includes('OWNER');
    const ownerOnly = () => {
      if (!isOwner) throw new HandlerError('Owner only', 'FORBIDDEN');
    };
    switch (op) {
      case 'registerBusiness':
        return await registerBusiness(deps, identity, (args as { business: unknown }).business);
      case 'registerCustomer':
        return await registerCustomer(deps, identity, args);
      case 'bookVenue':
        return await createBooking(client, identity, args);
      case 'cancelBooking':
        return await cancelBooking(client, identity, args);
      case 'respondBooking':
        return await respondBooking(client, identity, args);
      case 'saveVenue':
        return await saveVenue(client, identity, (args as { venue: unknown }).venue);
      case 'removeVenue':
        return await deleteVenue(client, identity, (args as { venueId: string }).venueId);
      case 'saveBusinessProfile':
        return await saveBusinessProfile(client, identity, (args as { profile: unknown }).profile, (args as { businessId?: string }).businessId);
      case 'ownerOverview':
        ownerOnly();
        return await ownerOverview(client);
      case 'ownerListUsers':
        ownerOnly();
        return await ownerListUsers(deps, args);
      case 'ownerUserAction':
        ownerOnly();
        return await ownerUserAction(deps, identity, args);
      case 'ownerSetTenantStatus':
        ownerOnly();
        return await ownerSetTenantStatus(deps, identity, args);
      case 'ownerDeleteTenant':
        ownerOnly();
        return await ownerDeleteTenant(deps, identity, args);
      default:
        throw new HandlerError(`Unknown operation ${op}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(op, e);
    throw e;
  }
};
