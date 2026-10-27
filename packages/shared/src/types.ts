import type { AccessMap } from './access.js';

/** Format standar response list (docs/tech-stack.md). */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
}

export interface SessionUser {
  id: number;
  username: string;
  fullname: string;
  email: string | null;
  roleId: number | null;
  roleName: string | null;
}

export interface MeResponse {
  user: SessionUser;
  access: AccessMap;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

export interface UserRow {
  id: number;
  fullname: string;
  username: string;
  email: string | null;
  isActive: boolean;
  lastLogin: string | null;
  roleId: number | null;
  roleName: string | null;
}

export interface RoleRow {
  id: number;
  name: string;
  userCount: number;
}

export interface RoleAccessResponse {
  role: { id: number; name: string };
  isSuperRole: boolean;
  userCount: number;
  access: AccessMap;
}
