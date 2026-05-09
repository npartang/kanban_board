"use client";

import { createContext, useContext } from "react";

type AuthContextType = {
  username: string;
  onUnauthenticated: () => void;
};

export const AuthContext = createContext<AuthContextType>({
  username: "",
  onUnauthenticated: () => {},
});

export const useAuth = () => useContext(AuthContext);
