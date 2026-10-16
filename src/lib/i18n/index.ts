import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import { KV_KEYS, kv } from '../storage/mmkv';
import { en } from './locales/en';
import { ar } from './locales/ar';

export type AppLanguage = 'en' | 'ar';
export const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'ar'];

function detectLanguage(): AppLanguage {
  const saved = kv.getString(KV_KEYS.language);
  if (saved === 'en' || saved === 'ar') return saved;
  const device = getLocales()[0]?.languageCode;
  return device === 'ar' ? 'ar' : 'en';
}

export const initialLanguage = detectLanguage();

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export const isRTL = (lang: AppLanguage) => lang === 'ar';

/** Apply RTL at startup (native needs the flag set before the first render). */
export function applyLayoutDirection(lang: AppLanguage): boolean {
  const rtl = isRTL(lang);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    return false;
  }
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true; // native requires a reload for the new direction to take effect
  }
  return false;
}

applyLayoutDirection(initialLanguage);

/** Change language; returns true when the app must be reloaded to flip layout direction. */
export async function setAppLanguage(lang: AppLanguage): Promise<boolean> {
  kv.setString(KV_KEYS.language, lang);
  await i18n.changeLanguage(lang);
  return applyLayoutDirection(lang);
}

export function currentLanguage(): AppLanguage {
  return i18n.language === 'ar' ? 'ar' : 'en';
}

export default i18n;
