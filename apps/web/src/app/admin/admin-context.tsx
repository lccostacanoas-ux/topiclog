"use client";

import React, { createContext, useContext } from "react";

export type AdminRole =
  | "GENERAL_ADMIN"
  | "FINANCIAL_ADMIN"
  | "LEGAL_OPERATOR"
  | "COMPLIANCE_AUDITOR"
  | "SUPPORT_OPERATOR";

export interface AdminRoleContextType {
  role: AdminRole;
  setRole: (r: AdminRole) => void;
  token: string;
}

export const AdminRoleContext = createContext<AdminRoleContextType>({
  role: "GENERAL_ADMIN",
  setRole: () => {},
  token: ""
});

export const useAdminRole = () => useContext(AdminRoleContext);
