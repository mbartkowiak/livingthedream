import { useState } from 'react'
import { FilingStatus } from '../utils/taxCalc'
import { BudgetOverrides, HouseholdPreset } from '../utils/budgetCalc'

const STORAGE_KEY = 'ltd-budget-prefs'

export interface BudgetPrefs {
  filingStatus: FilingStatus
  household: HouseholdPreset
  overrides: BudgetOverrides
}

const DEFAULTS: BudgetPrefs = {
  filingStatus: 'single',
  household: 'single',
  overrides: {},
}

function load(): BudgetPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return {
      filingStatus: parsed.filingStatus === 'married' ? 'married' : 'single',
      household: ['single', 'couple', 'family'].includes(parsed.household)
        ? parsed.household : 'single',
      overrides: typeof parsed.overrides === 'object' && parsed.overrides
        ? parsed.overrides : {},
    }
  } catch {
    return DEFAULTS
  }
}

function save(prefs: BudgetPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // storage full/blocked — prefs just won't persist
  }
}

/** Household/filing/override preferences shared across tabs, persisted locally. */
export function useBudgetPrefs() {
  const [prefs, setPrefs] = useState<BudgetPrefs>(load)

  const update = (patch: Partial<BudgetPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      save(next)
      return next
    })
  }

  const setOverride = (key: string, monthly: number | null) => {
    setPrefs(prev => {
      const overrides = { ...prev.overrides }
      if (monthly === null) delete overrides[key]
      else overrides[key] = monthly
      const next = { ...prev, overrides }
      save(next)
      return next
    })
  }

  const resetOverrides = () => update({ overrides: {} })

  return { prefs, update, setOverride, resetOverrides }
}
