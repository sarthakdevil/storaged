import { ResetPasswordForm } from "./ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const getFirstValue = (value: string | string[] | undefined) => {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const token = getFirstValue(resolvedSearchParams.token);
  const email = getFirstValue(resolvedSearchParams.email);

  return <ResetPasswordForm token={token} email={email} />;
}