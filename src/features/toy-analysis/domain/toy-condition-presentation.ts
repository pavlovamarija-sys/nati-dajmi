import type { ToyCondition } from '@/features/toy-analysis/types/toy-valuation';

export const TOY_CONDITION_LABELS: Record<ToyCondition, string> = {
  EXCELLENT: 'Одлична',
  GOOD: 'Добра',
  FAIR: 'Солидна',
  POOR: 'Лоша',
  UNKNOWN: 'Не може да се процени',
};
