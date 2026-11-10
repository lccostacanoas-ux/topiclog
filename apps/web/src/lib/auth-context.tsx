"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import {
  getPrivateProfileApi,
  loginUserApi,
  logoutUserApi,
  refreshSessionApi,
  registerUserApi
} from "./api-client";
import type {
  ApiFetchResult,
  AuthSessionResponse,
  LoginRequest,
  PrivateUserProfileResponse,
  RegisterUserRequest
} from "./types";

interface StoredSessionData {
  readonly token: string;
  readonly refreshToken: string;
  readonly profile: PrivateUserProfileResponse;
}

interface AuthContextValue {
  readonly user: PrivateUserProfileResponse | null;
  readonly token: string | null;
  readonly refreshToken: string | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly login: (credentials: LoginRequest) => Promise<ApiFetchResult<AuthSessionResponse>>;
  readonly register: (data: RegisterUserRequest) => Promise<ApiFetchResult<AuthSessionResponse>>;
  readonly refresh: () => Promise<boolean>;
  readonly logout: () => Promise<void>;
  readonly reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "topiclog_auth_session_v2";
const RESET_KEY = "topiclog_clean_state_v20261110_prod";

function performInitialCleanIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage.getItem(RESET_KEY)) {
      const keys = [
        "topiclog_auth_session_v1",
        "topiclog_auth_session_v2",
        "topiclog_clean_state_v20261106",
        "topiclog_users",
        "topiclog_community_ratings_v1",
        "topiclog_user_shipments_v4",
        "topiclog_user_shipments_v3",
        "topiclog_user_shipments_v2",
        "topiclog_user_shipments",
        "topiclog_user_trips_v4",
        "topiclog_user_trips_v3",
        "topiclog_user_trips",
        "topiclog_user_proposals_v4",
        "topiclog_user_proposals_v3",
        "topiclog_user_proposals",
        "topiclog_user_chats_v4",
        "topiclog_user_chats_v3",
        "topiclog_user_chats"
      ];
      for (const k of keys) {
        window.localStorage.removeItem(k);
        window.sessionStorage.removeItem(k);
      }
      window.localStorage.setItem(RESET_KEY, "done");
    }
  } catch {
    // ignore
  }
}

function readStoredSession(): StoredSessionData | null {
  if (typeof window === "undefined") {
    return null;
  }
  performInitialCleanIfNeeded();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredSessionData;
  } catch {
    return null;
  }
}

function writeStoredSession(data: StoredSessionData | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (data) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Falha silenciosa em navegadores com armazenamento restrito
  }
}

export function AuthProvider({
  children
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [user, setUser] = useState<PrivateUserProfileResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshTokenVal, setRefreshTokenVal] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleSessionSuccess = useCallback((session: AuthSessionResponse) => {
    setToken(session.accessToken);
    setRefreshTokenVal(session.refreshToken);
    setUser(session.profile);
    writeStoredSession({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      profile: session.profile
    });
  }, []);

  // Inicializa sessão a partir do armazenamento local e valida em background
  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setToken(stored.token);
      setRefreshTokenVal(stored.refreshToken);
      setUser(stored.profile);

      // Validação não-bloqueante em segundo plano:
      // se o token foi invalidado (ex: rotação de chaves no backend ou expiração),
      // tenta renovar silenciosamente com refresh token; se falhar, limpa sessão obsoleta.
      void (async () => {
        try {
          const profileCheck = await getPrivateProfileApi(stored.token);
          if (profileCheck.status === 401) {
            if (stored.refreshToken) {
              const refreshRes = await refreshSessionApi({ refreshToken: stored.refreshToken });
              if (refreshRes.ok && refreshRes.data) {
                handleSessionSuccess(refreshRes.data);
                return;
              }
            }
            // Sessão definitivamente inválida: limpa estado residual
            setToken(null);
            setRefreshTokenVal(null);
            setUser(null);
            writeStoredSession(null);
          }
        } catch {
          // Mantém estado offline/sem rede se a requisição falhar por rede
        }
      })();
    }
    setIsLoading(false);
  }, [handleSessionSuccess]);

  const login = useCallback(
    async (credentials: LoginRequest): Promise<ApiFetchResult<AuthSessionResponse>> => {
      setIsLoading(true);
      try {
        const result = await loginUserApi(credentials);
        if (result.ok && result.data) {
          handleSessionSuccess(result.data);
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [handleSessionSuccess]
  );

  const register = useCallback(
    async (data: RegisterUserRequest): Promise<ApiFetchResult<AuthSessionResponse>> => {
      setIsLoading(true);
      try {
        const result = await registerUserApi(data);
        if (result.ok && result.data) {
          handleSessionSuccess(result.data);
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [handleSessionSuccess]
  );

  const logout = useCallback(async (): Promise<void> => {
    if (token && refreshTokenVal) {
      try {
        await logoutUserApi(token, { refreshToken: refreshTokenVal });
      } catch {
        // Encerramento local mesmo se a chamada falhar
      }
    }
    setToken(null);
    setRefreshTokenVal(null);
    setUser(null);
    writeStoredSession(null);
  }, [token, refreshTokenVal]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!refreshTokenVal) {
      return false;
    }
    try {
      const result = await refreshSessionApi({ refreshToken: refreshTokenVal });
      if (result.ok && result.data) {
        handleSessionSuccess(result.data);
        return true;
      }
      await logout();
      return false;
    } catch {
      await logout();
      return false;
    }
  }, [refreshTokenVal, handleSessionSuccess, logout]);

  const reloadProfile = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    const result = await getPrivateProfileApi(token);
    if (result.ok && result.data) {
      setUser(result.data);
      if (refreshTokenVal) {
        writeStoredSession({
          token,
          refreshToken: refreshTokenVal,
          profile: result.data
        });
      }
    } else if (result.status === 401) {
      const refreshed = await refresh();
      if (!refreshed) {
        await logout();
      }
    }
  }, [token, refreshTokenVal, refresh, logout]);

  const value: AuthContextValue = {
    user,
    token,
    refreshToken: refreshTokenVal,
    isLoading,
    isAuthenticated: Boolean(token && user),
    login,
    register,
    refresh,
    logout,
    reloadProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um <AuthProvider />");
  }
  return context;
}
