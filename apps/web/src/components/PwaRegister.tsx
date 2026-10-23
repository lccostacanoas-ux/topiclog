"use client";

import React, { useEffect } from "react";

export function PwaRegister(): null {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      if (isLocalhost) {
        // No ambiente local de desenvolvimento, desregistra service workers e limpa caches
        // para garantir que o navegador sempre execute o código mais recente compilado pelo Next.js
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
        if ("caches" in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              caches.delete(key);
            }
          });
        }
        return;
      }

      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            if (process.env.NODE_ENV === "development") {
              console.log("[PWA] Service Worker registrado com escopo:", registration.scope);
            }
          })
          .catch((error) => {
            console.warn("[PWA] Falha ao registrar Service Worker:", error);
          });
      });
    }
  }, []);

  return null;
}
