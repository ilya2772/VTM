import { redirect } from "next/navigation";

export default function ChallengePaymentCancelledPage() {
  redirect("/?payment=cancelled");
}
