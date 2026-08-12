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
    return 'The email or password is incorrect.';
  }

  if (message.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }

  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'An account with this email already exists.';
  }

  if (message.includes('password')) {
    return 'Please choose a password that meets the requirements.';
  }

  if (message.includes('email')) {
    return 'Please enter a valid email address.';
  }

  return "We couldn't complete that request. Please try again.";
}
