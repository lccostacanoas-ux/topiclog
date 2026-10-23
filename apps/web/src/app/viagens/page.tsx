import { redirect } from "next/navigation";

export default function ViagensRedirectPage(): never {
  redirect("/viagens/cadastrar");
}
