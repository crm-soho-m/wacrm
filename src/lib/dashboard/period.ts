// Período do painel (SohoM): um único intervalo vale para o painel todo.
// Datas em fuso local; `end` é exclusivo. O período anterior tem a mesma
// duração e termina onde o atual começa (usado nas comparações).

import { localDayKey, startOfLocalDay } from './date-utils'

export type PeriodKey = 'today' | '7' | '30' | '90' | 'month' | 'custom'

export interface DashboardPeriod {
  key: PeriodKey
  start: Date
  end: Date
  prevStart: Date
  prevEnd: Date
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function parseLocalDate(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function buildPeriod(
  key: PeriodKey,
  customFrom = '',
  customTo = '',
): DashboardPeriod {
  const today = startOfLocalDay()
  const tomorrow = addDays(today, 1)
  let start: Date
  let end: Date = tomorrow

  switch (key) {
    case 'today':
      start = today
      break
    case '7':
    case '30':
    case '90':
      start = addDays(today, -(Number(key) - 1))
      break
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1)
      break
    case 'custom': {
      const from = parseLocalDate(customFrom)
      const to = parseLocalDate(customTo)
      start = from ?? addDays(today, -29)
      end = to ? addDays(to, 1) : tomorrow
      if (end <= start) end = addDays(start, 1)
      break
    }
  }

  const span = end.getTime() - start.getTime()
  return {
    key,
    start,
    end,
    prevStart: new Date(start.getTime() - span),
    prevEnd: start,
  }
}

/** Chaves YYYY-MM-DD de cada dia do período, em ordem. */
export function periodDayKeys(p: DashboardPeriod): string[] {
  const keys: string[] = []
  for (let d = new Date(p.start); d < p.end; d = addDays(d, 1)) {
    keys.push(localDayKey(d))
  }
  return keys
}
