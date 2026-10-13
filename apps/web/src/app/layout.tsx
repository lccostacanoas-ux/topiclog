import type { Metadata } from "next";
import React from "react";
import "../styles/tokens.css";

export const metadata: Metadata = {
  title: "Topic Log — Marketplace de Pequenas Encomendas e Rotas em Minas Gerais (Ambiente de Testes)",
  description:
    "Protótipo técnico da plataforma Topic Log para todo o estado de Minas Gerais, com piloto prioritário em João Monlevade e Belo Horizonte."
};

export default function RootLayout({
  children
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#main-content" className="skip-link">
          Pular para o conteúdo principal
        </a>
        <div className="env-banner" role="region" aria-label="Aviso de ambiente de testes">
          <div className="container">
            <strong>Ambiente de Testes (Sandbox — D14):</strong> Nenhuma transação financeira real, apólice de seguro
            ou promessa comercial ativa está habilitada nesta fase. Nome de trabalho <strong>Topic Log</strong> (domínio
            pretendido <code>www.topiclog.com.br</code> sujeito a verificação de registro/INPI — D01).
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
