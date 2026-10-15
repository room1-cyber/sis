import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { Lang } from '@/types';
import {
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDiopter,
  formatMoney,
  formatMoneyShort,
  formatMonth,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatTime,
  type FmtOptions,
} from '@/lib/format';
import { ar, type TranslationKey } from './ar';
import { en } from './en';

export type { TranslationKey };

const DICTS: Record<Lang, Record<string, string>> = { ar, en };

export function translate(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  const template = DICTS[lang][key] ?? DICTS.ar[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}

export interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  isRtl: boolean;
  /** Translation with `{placeholder}` interpolation. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Picks the right value from a bilingual pair, falling back to the other one. */
  pick: (ar_: string | undefined, en_: string | undefined) => string;
  fmt: FmtOptions;
  money: (value: number) => string;
  moneyShort: (value: number) => string;
  num: (value: number, options?: Intl.NumberFormatOptions) => string;
  qty: (value: number) => string;
  percent: (value: number, digits?: number) => string;
  date: (value?: string | Date) => string;
  dateLong: (value?: string | Date) => string;
  dateTime: (value?: string | Date) => string;
  time: (value?: string | Date) => string;
  month: (value: string) => string;
  diopter: (value: number | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export interface I18nProviderProps {
  lang: Lang;
  currency?: string;
  arabicNumerals?: boolean;
  hijriDates?: boolean;
  onChangeLang?: (lang: Lang) => void;
  children: ReactNode;
}

export function I18nProvider({
  lang,
  currency = 'SAR',
  arabicNumerals = false,
  hijriDates = false,
  onChangeLang,
  children,
}: I18nProviderProps) {
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', dir);
  }, [lang, dir]);

  const setLang = useCallback(
    (next: Lang) => {
      onChangeLang?.(next);
    },
    [onChangeLang],
  );

  const value = useMemo<I18nValue>(() => {
    const fmt: FmtOptions = {
      lang,
      currency,
      numerals: arabicNumerals ? 'arab' : 'latn',
      hijri: hijriDates,
    };
    const dict = DICTS[lang];
    return {
      lang,
      dir,
      isRtl: dir === 'rtl',
      fmt,
      t: (key, vars) => {
        const template = dict[key] ?? DICTS.ar[key] ?? key;
        if (!vars) return template;
        return template.replace(/\{(\w+)\}/g, (match, name: string) =>
          vars[name] === undefined ? match : String(vars[name]),
        );
      },
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      pick: (ar_, en_) => (lang === 'ar' ? ar_ || en_ || '' : en_ || ar_ || ''),
      money: (v) => formatMoney(v, fmt),
      moneyShort: (v) => formatMoneyShort(v, fmt),
      num: (v, options) => formatNumber(v, fmt, options),
      qty: (v) => formatQuantity(v, fmt),
      percent: (v, digits) => formatPercent(v, fmt, digits),
      date: (v) => formatDate(v, fmt),
      dateLong: (v) => formatDateLong(v, fmt),
      dateTime: (v) => formatDateTime(v, fmt),
      time: (v) => formatTime(v, fmt),
      month: (v) => formatMonth(v, fmt),
      diopter: (v) => formatDiopter(v),
    };
  }, [lang, dir, currency, arabicNumerals, hijriDates, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Convenience hook for components that only need the translator. */
export function useT(): I18nValue['t'] {
  return useI18n().t;
}
