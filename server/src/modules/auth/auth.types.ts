import type { Role } from "../../middleware/auth.middleware.js";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
