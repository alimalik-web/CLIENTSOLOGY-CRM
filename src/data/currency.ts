import { CurrencyCode } from '../types/crm';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  label: string;
  rateFromUsd: number;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', label: 'US Dollar (USD)', rateFromUsd: 1, decimals: 0 },
  PKR: { code: 'PKR', symbol: 'Rs.', label: 'Pakistani Rupee (PKR)', rateFromUsd: 278, decimals: 0 },
  EUR: { code: 'EUR', symbol: '€', label: 'Euro (EUR)', rateFromUsd: 0.92, decimals: 0 },
  GBP: { code: 'GBP', symbol: '£', label: 'British Pound (GBP)', rateFromUsd: 0.79, decimals: 0 },
  AED: { code: 'AED', symbol: 'AED ', label: 'UAE Dirham (AED)', rateFromUsd: 3.67, decimals: 0 },
  SAR: { code: 'SAR', symbol: 'SAR ', label: 'Saudi Riyal (SAR)', rateFromUsd: 3.75, decimals: 0 },
};

export const CURRENCY_LIST: CurrencyCode[] = ['USD', 'PKR', 'EUR', 'GBP', 'AED', 'SAR'];

export function convertFromUsd(amountUsd: number, currency: CurrencyCode): number {
  return Math.round(amountUsd * CURRENCIES[currency].rateFromUsd);
}

export function convertToUsd(amountLocal: number, currency: CurrencyCode): number {
  const rate = CURRENCIES[currency].rateFromUsd || 1;
  return amountLocal / rate;
}

export function formatMoney(
  amountUsd: number,
  currency: CurrencyCode,
  options?: { compact?: boolean }
): string {
  const cfg = CURRENCIES[currency];
  const converted = Math.round(amountUsd * cfg.rateFromUsd);
  const abs = Math.abs(converted);
  const sign = converted < 0 ? '-' : '';

  if (options?.compact && abs >= 1000) {
    if (currency === 'PKR' && abs >= 100000) {
      const lakhs = (abs / 100000).toFixed(1).replace(/\.0$/, '');
      return `${sign}${cfg.symbol}${lakhs}L`;
    }
    if (abs >= 1000000) {
      return `${sign}${cfg.symbol}${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    return `${sign}${cfg.symbol}${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return `${sign}${cfg.symbol}${abs.toLocaleString('en-US')}`;
}

export function formatMoneyRange(
  minUsd: number,
  maxUsd: number,
  currency: CurrencyCode,
  suffix = '/mo'
): string {
  return `${formatMoney(minUsd, currency, { compact: true })}–${formatMoney(maxUsd, currency, { compact: true })}${suffix}`;
}
