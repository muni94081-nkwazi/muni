import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import en from './locales/en.json';
import sw from './locales/sw.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import yo from './locales/yo.json';
import ha from './locales/ha.json';
import am from './locales/am.json';

const STORAGE_KEY = 'muni_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',  nativeName: 'English',  flag: '🇬🇧', rtl: false },
  { code: 'sw', name: 'Swahili',  nativeName: 'Kiswahili', flag: '🇰🇪', rtl: false },
  { code: 'fr', name: 'French',   nativeName: 'Français',  flag: '🇫🇷', rtl: false },
  { code: 'ar', name: 'Arabic',   nativeName: 'العربية',   flag: '🇦🇪', rtl: true  },
  { code: 'yo', name: 'Yoruba',   nativeName: 'Yorùbá',    flag: '🇳🇬', rtl: false },
  { code: 'ha', name: 'Hausa',    nativeName: 'Hausa',     flag: '🇳🇬', rtl: false },
  { code: 'am', name: 'Amharic',  nativeName: 'አማርኛ',     flag: '🇪🇹', rtl: false },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

async function getInitialLanguage(): Promise<string> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
  const supported = SUPPORTED_LANGUAGES.find(l => l.code === deviceLocale);
  return supported ? deviceLocale : 'en';
}

export async function initI18n(): Promise<void> {
  const language = await getInitialLanguage();
  await i18n
    .use(initReactI18next)
    .init({
      resources: { 
        en: { translation: en }, 
        sw: { translation: sw }, 
        fr: { translation: fr }, 
        ar: { translation: ar }, 
        yo: { translation: yo }, 
        ha: { translation: ha }, 
        am: { translation: am } 
      },
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });
}

export async function changeLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(STORAGE_KEY, code);
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  if (lang?.rtl) {
    I18nManager.forceRTL(true);
  } else {
    I18nManager.forceRTL(false);
  }
}

export default i18n;
