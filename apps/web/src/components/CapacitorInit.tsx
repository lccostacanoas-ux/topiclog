"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

export function CapacitorInit(): null {
  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
      return;
    }

    // 1. Configurar barra de status nativa
    try {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: "#0F172A" });
    } catch (err) {
      console.warn("[Capacitor] Erro ao configurar StatusBar:", err);
    }

    // 2. Ocultar Splash Screen após inicialização do React/Next
    try {
      SplashScreen.hide();
    } catch (err) {
      console.warn("[Capacitor] Erro ao ocultar SplashScreen:", err);
    }

    // 3. Tratar botão físico/virtual Voltar no Android
    const backButtonHandler = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (window.location.pathname === "/" || window.location.pathname === "/feed") {
        CapacitorApp.exitApp();
      } else if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      backButtonHandler.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
