import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: "ADMIN" | "MANAGER" | "OPERATOR";
}

export function signSessionToken(payload: JwtPayload): { token: string; expiresInHours: number } {
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRES_IN_HOURS}h`,
  });
  return { token, expiresInHours: env.JWT_EXPIRES_IN_HOURS };
}

export function verifySessionToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export const SESSION_COOKIE_NAME = "shelfsense_session";
