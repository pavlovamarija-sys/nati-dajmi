import type { AuthError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export type SignUpResult = {
  confirmationRequired: boolean;
};

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }

  return { confirmationRequired: data.session === null };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function getParentFriendlyAuthError(error: unknown): string {
  const authError = error as Partial<AuthError> | null;
  const message = authError?.message?.toLowerCase() ?? '';

  if (message.includes('invalid login credentials')) {
    return 'Е-поштата или лозинката не е точна.';
  }

  if (message.includes('email not confirmed')) {
    return 'Потврди ја е-поштата пред да се најавиш.';
  }

  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'Веќе постои профил со оваа е-пошта.';
  }

  if (message.includes('password')) {
    return 'Избери лозинка што ги исполнува барањата.';
  }

  if (message.includes('email')) {
    return 'Внеси важечка адреса за е-пошта.';
  }

  return 'Не можевме да го завршиме барањето. Обиди се повторно.';
}
