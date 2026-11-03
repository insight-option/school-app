import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clientFor, type AppConfig } from '../lib/data/client';
import { useSession } from '../lib/auth/session';
import { ACCENT_DEFAULT, BRAND_DEFAULT } from '../ui/theme';

/** Row id of the single AppConfig record (owner console → Branding). */
export const APP_CONFIG_ID = 'app';
export const APP_CONFIG_KEY = ['appConfig'] as const;

export type Branding = {
  appName: string;
  tagline: string;
  logoKey: string | null;
  iconKey: string | null;
  heroImageKey: string | null;
  primaryColor: string;
  accentColor: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  announcement: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
  currency: string;
};

/** Shipped defaults – used until the owner saves a branding in the console (and while offline). */
export const DEFAULT_BRANDING = {
  appName: 'OneQ',
  appNameAr: 'ون كيو',
  tagline: 'Schools, sports & activities across Qatar',
  taglineAr: 'المدارس والرياضة والأنشطة في قطر',
} as const;

/** The AppConfig row (public read, persisted with the query cache so the first frame is branded). */
export function useAppConfig() {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  return useQuery({
    queryKey: APP_CONFIG_KEY,
    enabled: session.status !== 'loading',
    staleTime: 5 * 60_000,
    gcTime: 30 * 24 * 3600_000,
    queryFn: async (): Promise<AppConfig | null> => {
      const res = await clientFor(signedIn).models.AppConfig.get({ id: APP_CONFIG_ID });
      return res.data ?? null; // missing row → defaults
    },
  });
}

const isHex = (v: string | null | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

export function resolveBranding(cfg: AppConfig | null | undefined, arabic: boolean): Branding {
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (arabic ? ar || en : en || ar) || null;
  return {
    appName: pick(cfg?.appName, cfg?.appNameAr) ?? (arabic ? DEFAULT_BRANDING.appNameAr : DEFAULT_BRANDING.appName),
    tagline: pick(cfg?.tagline, cfg?.taglineAr) ?? (arabic ? DEFAULT_BRANDING.taglineAr : DEFAULT_BRANDING.tagline),
    logoKey: cfg?.logoKey || null,
    iconKey: cfg?.iconKey || null,
    heroImageKey: cfg?.heroImageKey || null,
    primaryColor: isHex(cfg?.primaryColor) ? cfg.primaryColor : BRAND_DEFAULT,
    accentColor: isHex(cfg?.accentColor) ? cfg.accentColor : ACCENT_DEFAULT,
    heroTitle: pick(cfg?.heroTitle, cfg?.heroTitleAr),
    heroSubtitle: pick(cfg?.heroSubtitle, cfg?.heroSubtitleAr),
    announcement: pick(cfg?.announcement, cfg?.announcementAr),
    supportEmail: cfg?.supportEmail || null,
    supportPhone: cfg?.supportPhone || null,
    whatsapp: cfg?.whatsapp || null,
    instagram: cfg?.instagram || null,
    website: cfg?.website || null,
    currency: cfg?.currency || 'QAR',
  };
}

export function useBranding(): Branding {
  const cfg = useAppConfig();
  const { i18n } = useTranslation();
  return resolveBranding(cfg.data, i18n.language === 'ar');
}

/** Keeps the browser tab title in sync with the app name (web only). */
export function useDocumentTitle(name: string) {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && name) document.title = name;
  }, [name]);
}
