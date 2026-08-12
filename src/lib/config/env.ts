function requirePublicEnvironmentValue(
  value: string | undefined,
  variableName: string,
): string {
  const normalizedValue = value?.trim();

  if (normalizedValue) {
    return normalizedValue;
  }

  const setupHint = __DEV__
    ? ' Copy .env.example to .env, provide the value, and restart Expo.'
    : '';

  throw new Error(`Missing required environment variable: ${variableName}.${setupHint}`);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const localDetectorUrl = process.env.EXPO_PUBLIC_LOCAL_DETECTOR_URL?.trim();

if (__DEV__) {
  console.info('[toy-analysis] supabase_url_configured', {
    configured: Boolean(supabaseUrl?.trim()),
  });
  console.info('[toy-analysis] supabase_key_configured', {
    configured: Boolean(supabaseAnonKey?.trim()),
  });
}

export const supabaseConfig = {
  url: requirePublicEnvironmentValue(
    supabaseUrl,
    'EXPO_PUBLIC_SUPABASE_URL',
  ),
  anonKey: requirePublicEnvironmentValue(
    supabaseAnonKey,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ),
} as const;

export const developmentConfig = {
  localDetectorUrl: __DEV__ && localDetectorUrl
    ? localDetectorUrl.replace(/\/+$/, '')
    : null,
} as const;
