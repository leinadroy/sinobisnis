import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MATRIX_KEYS, MENU_KEY_BY_ITEM_ID, SUPER_ROLE, type AccessMap, type LoginResponse, type SessionUser } from '@sml/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, JwtPayload } from './auth.types.js';
import { hashPassword, verifyPassword } from './password.js';

type UserWithRole = {
  id: number; username: string; fullname: string; email: string; roleId: number; salt: string; hashedPassword: string;
  role: { name: string; programs: { menuItemId: number; isActive: boolean; isAllowEdit: boolean }[] };
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private toSessionUser(u: UserWithRole): SessionUser {
    return { id: u.id, username: u.username, fullname: u.fullname, email: u.email || null, roleId: u.roleId, roleName: u.role.name };
  }

  /**
   * Hak akses efektif dari rolepgmname (per MenuItemId). Role Developer selalu penuh.
   * Beberapa baris bisa menunjuk menu yang sama (mis. ClientList & ClientDetail): digabung.
   */
  accessFor(u: UserWithRole): { access: AccessMap; isSuperRole: boolean } {
    const isSuperRole = u.role.name === SUPER_ROLE;
    const access: AccessMap = {};
    if (isSuperRole) {
      MATRIX_KEYS.forEach((k) => { access[k] = { view: true, edit: true }; });
    } else {
      for (const p of u.role.programs) {
        const key = MENU_KEY_BY_ITEM_ID[p.menuItemId];
        if (!key || !p.isActive) continue;
        access[key] = { view: true, edit: Boolean(access[key]?.edit || p.isAllowEdit) };
      }
    }
    return { access, isSuperRole };
  }

  private findActiveUser(where: { id: number } | { username: string }) {
    return this.prisma.user.findFirst({
      where: { ...where, isActive: true },
      include: { role: { include: { programs: true } } },
    });
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const u = await this.findActiveUser({ username: username.trim() });
    // Pesan sama untuk user tidak ada / password salah supaya username tidak bisa ditebak.
    if (!u || !(await verifyPassword(u, password))) {
      throw new UnauthorizedException('Username atau password salah.');
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { lastLogin: new Date() } });
    const payload: JwtPayload = { sub: u.id };
    const accessToken = await this.jwt.signAsync(payload);
    const { exp } = this.jwt.decode(accessToken) as { exp: number };
    return { accessToken, expiresIn: exp - Math.floor(Date.now() / 1000), user: this.toSessionUser(u) };
  }

  /** Dipanggil JwtAuthGuard di setiap request: user nonaktif / dihapus langsung tertolak. */
  async resolveToken(token: string): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesi login tidak valid atau sudah kedaluwarsa.');
    }
    const u = await this.findActiveUser({ id: payload.sub });
    if (!u) throw new UnauthorizedException('User tidak aktif.');
    return { ...this.toSessionUser(u), ...this.accessFor(u) };
  }

  async changePassword(userId: number, current: string, next: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(u, current))) throw new BadRequestException('Password lama salah.');
    await this.prisma.user.update({ where: { id: userId }, data: await hashPassword(next) });
  }

  async updateProfile(userId: number, data: { fullname: string; email?: string | null }) {
    await this.prisma.user.update({ where: { id: userId }, data: { fullname: data.fullname.trim(), email: data.email?.trim() || '' } });
  }
}
