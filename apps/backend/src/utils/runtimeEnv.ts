export type RuntimeEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  FRONTEND_URL?: string;
  APP_URL?: string;
  RESEND_KEY?: string;
  JWT_SECRET?: string;
};

let runtimeEnv: RuntimeEnv = {};

export const configureRuntimeEnv = (env: RuntimeEnv) => {
  runtimeEnv = {
    ...runtimeEnv,
    ...Object.fromEntries(
      Object.entries(env).filter(([, value]) => typeof value === "string" && value.length > 0),
    ),
  };
};

export const getRuntimeEnv = () => runtimeEnv;

export const getRuntimeValue = (key: keyof RuntimeEnv) => {
  return runtimeEnv[key] ?? process.env[key];
};
