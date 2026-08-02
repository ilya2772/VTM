import { redirect } from "next/navigation";

export default async function ChallengePaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  redirect(
    `/?payment=success${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`,
  );
}
