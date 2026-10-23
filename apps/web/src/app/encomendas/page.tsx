import { redirect } from "next/navigation";

export default function EncomendasRedirectPage(): never {
  redirect("/feed");
}
