"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useAuth } from "../lib/auth-context";
import { StatusPill } from "./StatusPill";

export function NavigationHeader(): React.JSX.Element {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

  const isLinkActive = (href: string) => pathname === href;

  return (
    <header className="nav-header">
      <div className="container nav-container">
        <Link href="/" className="nav-brand">
          <span>Topic Log</span>
        </Link>

        <nav aria-label="Navegação principal">
          <ul className="nav-links">
            <li>
              <Link
                href="/"
                className={`nav-link ${isLinkActive("/") ? "nav-link--active" : ""}`}
              >
                Início
              </Link>
            </li>
            <li>
              <Link
                href="/termos"
                className={`nav-link ${isLinkActive("/termos") ? "nav-link--active" : ""}`}
              >
                Termos (D08)
              </Link>
            </li>

            {!isAuthenticated ? (
              <>
                <li>
                  <Link
                    href="/entrar"
                    className={`nav-link ${isLinkActive("/entrar") ? "nav-link--active" : ""}`}
                  >
                    Entrar
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cadastro"
                    className="btn btn--primary"
                    style={{ padding: "6px 14px", fontSize: "14px" }}
                  >
                    Criar Conta
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link
                    href="/minha-conta"
                    className={`nav-link ${isLinkActive("/minha-conta") ? "nav-link--active" : ""}`}
                  >
                    Minha Conta
                  </Link>
                </li>
                <li>
                  <Link
                    href="/verificacao-kyc"
                    className={`nav-link ${isLinkActive("/verificacao-kyc") ? "nav-link--active" : ""}`}
                  >
                    Verificação KYC
                  </Link>
                </li>
                <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {user && (
                    <StatusPill
                      label={user.kycStatus === "VERIFIED" ? "KYC Aprovado" : `KYC: ${user.kycStatus}`}
                      tone={
                        user.kycStatus === "VERIFIED"
                          ? "success"
                          : user.kycStatus === "REJECTED"
                          ? "danger"
                          : "warning"
                      }
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="btn btn--outline"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                    aria-label="Encerrar sessão"
                  >
                    Sair
                  </button>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
