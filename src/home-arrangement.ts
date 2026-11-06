/** Compatibility facade; new host code imports the arrangement owner directly. */
export { commitHomeArrangement } from './host/resident/arrangement.ts'
export { planHomeArrangement } from './domain/home/arrangement.ts'
export type { ArrangementCommand, ArrangementPlan, ArrangementState } from './domain/home/arrangement.ts'
