"use client";

import { createContext, useContext } from "react";

type AuthContextType = {
  onUnauthenticated: () => void;
};

export const AuthContext = createContext<AuthContextType>({
  onUnauthenticated: () => {},
});

export const useAuth = () => useContext(AuthContext);
