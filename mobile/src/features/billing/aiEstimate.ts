import { AI_INCLUDED_EXAMPLE_RATES, buildAiIncludedEstimate, formatAiIncludedEstimateLines } from './aiIncludedEstimate.generated'
import type { AiIncludedRates } from './types'

export const AI_ESTIMATE_RATES = AI_INCLUDED_EXAMPLE_RATES
export function aiEstimate(included: number, rates?: AiIncludedRates): string[] {
  return formatAiIncludedEstimateLines(buildAiIncludedEstimate({ includedRub: included, rates }))
}
