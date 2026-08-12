import type { ChildAge } from '@/features/toy-analysis/types/toy-analysis';

export function isValidChildAge(age: ChildAge): boolean {
  return Number.isInteger(age.value) && age.value > 0;
}

export function childAgeToMonths(age: ChildAge): number {
  if (!isValidChildAge(age)) {
    throw new Error('Child age must be a positive whole number.');
  }

  return age.unit === 'years' ? age.value * 12 : age.value;
}
