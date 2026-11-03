import type { DataClient } from './data';
import { nowIso } from './data';

/**
 * Platform-level bookkeeping shared by the Lambdas: the owner's activity feed and the trial
 * subscription every new school / business starts with.
 */

export const DEFAULT_TRIAL_DAYS = 30;

export async function recordEvent(
  client: DataClient,
  e: { type: string; title: string; detail?: string; tenantId?: string; tenantType?: 'SCHOOL' | 'BUSINESS'; actorId?: string; data?: Record<string, unknown> },
): Promise<void> {
  try {
    await client.models.PlatformEvent.create({
      feed: 'ALL',
      type: e.type,
      title: e.title.slice(0, 200),
      detail: e.detail?.slice(0, 500),
      tenantId: e.tenantId,
      tenantType: e.tenantType,
      actorId: e.actorId,
      data: e.data ? JSON.stringify(e.data) : undefined,
      occurredAt: nowIso(),
    });
  } catch (err) {
    console.warn('platform event failed', err); // the feed is informational – never fail the caller
  }
}

/** Starts a trial on the cheapest active plan for the tenant type (or without a plan). */
export async function startTrialSubscription(
  client: DataClient,
  t: { tenantId: string; tenantType: 'SCHOOL' | 'BUSINESS'; tenantName: string; billingName?: string; billingEmail?: string; billingPhone?: string },
): Promise<void> {
  try {
    const existing = await client.models.TenantSubscription.get({ tenantId: t.tenantId });
    if (existing.data) return;
    const plans = (await client.models.Plan.list({ limit: 200 })).data
      .filter((p) => p.active !== false && (p.tenantType === t.tenantType || p.tenantType === 'ANY'))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.priceMonthly ?? 0) - (b.priceMonthly ?? 0));
    const plan = plans[0];
    const config = (await client.models.AppConfig.get({ id: 'app' })).data;
    const trialDays = plan?.trialDays ?? DEFAULT_TRIAL_DAYS;
    const today = new Date();
    const trialEnd = new Date(today.getTime() + trialDays * 86_400_000).toISOString().slice(0, 10);
    await client.models.TenantSubscription.create({
      tenantId: t.tenantId,
      tenantType: t.tenantType,
      tenantName: t.tenantName,
      planId: plan?.id,
      planName: plan?.name,
      status: 'TRIAL',
      cycle: 'MONTHLY',
      price: plan?.priceMonthly ?? 0,
      currency: plan?.currency ?? config?.currency ?? 'QAR',
      commissionPercent: plan?.commissionPercent ?? config?.defaultCommissionPercent ?? 0,
      trialEndsAt: trialEnd,
      currentPeriodStart: today.toISOString().slice(0, 10),
      currentPeriodEnd: trialEnd,
      billingName: t.billingName,
      billingEmail: t.billingEmail,
      billingPhone: t.billingPhone,
      startedAt: nowIso(),
    });
  } catch (err) {
    console.warn('trial subscription failed', err); // the owner can create it from the console
  }
}
