export interface BrazilianStateOption {
  readonly uf: string;
  readonly name: string;
}

export const BRAZILIAN_STATES: readonly BrazilianStateOption[] = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" }
];

export function formatCep(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export interface ViaCepLookupResult {
  readonly postalCode: string;
  readonly street: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly stateUf: string;
}

export async function lookupCepViaCep(cepInput: string): Promise<ViaCepLookupResult | null> {
  const digits = (cepInput || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      erro?: boolean;
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro || !data.localidade || !data.uf) return null;
    return {
      postalCode: formatCep(data.cep || digits),
      street: (data.logradouro || "").trim(),
      neighborhood: (data.bairro || "").trim(),
      city: data.localidade.trim(),
      stateUf: data.uf.trim().toUpperCase()
    };
  } catch {
    return null;
  }
}
