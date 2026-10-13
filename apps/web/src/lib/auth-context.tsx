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

const STORAGE_KEY = "topiclog_auth_session_v1";

function readStoredSession(): StoredSessionData | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
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

  // Inicializa sessão a partir de sessionStorage
  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setToken(stored.token);
      setRefreshTokenVal(stored.refreshToken);
      setUser(stored.profile);
    }
    setIsLoading(false);
  }, []);

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
