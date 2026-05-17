import { ResetPasswordForm } from "./ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const getFirstValue = (value: string | string[] | undefined) => {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = getFirstValue(searchParams?.token);
  const email = getFirstValue(searchParams?.email);

  return <ResetPasswordForm token={token} email={email} />;
}