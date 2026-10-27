import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { MATRIX_KEYS, SUPER_ROLE, type AccessMap, type LoginResponse, type SessionUser } from '@sml/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, JwtPayload } from './auth.types.js';

type UserWithRole = {
  id: number; username: string; fullname: string; email: string | null; roleId: number | null;
  role: { name: string; menus: { menuKey: string; isActive: boolean; allowEdit: boolean }[] } | null;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private toSessionUser(u: UserWithRole): SessionUser {
    return { id: u.id, username: u.username, fullname: u.fullname, email: u.email, roleId: u.roleId, roleName: u.role?.name ?? null };
  }

  /** Hak akses efektif: role Developer selalu penuh; Edit tanpa Lihat diabaikan. */
  accessFor(u: UserWithRole): { access: AccessMap; isSuperRole: boolean } {
    const isSuperRole = u.role?.name === SUPER_ROLE;
    const access: AccessMap = {};
    if (isSuperRole) {
      MATRIX_KEYS.forEach((k) => { access[k] = { view: true, edit: true }; });
    } else {
      u.role?.menus.forEach((m) => {
        if (m.isActive) access[m.menuKey] = { view: true, edit: m.allowEdit };
      });
    }
    return { access, isSuperRole };
  }

  private findActiveUser(where: { id: number } | { username: string }) {
    return this.prisma.user.findFirst({
      where: { ...where, isActive: true },
      include: { role: { include: { menus: true } } },
    });
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const u = await this.findActiveUser({ username });
    // Pesan sama untuk user tidak ada / password salah supaya username tidak bisa ditebak.
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
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
    if (!(await bcrypt.compare(current, u.passwordHash))) throw new BadRequestException('Password lama salah.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  }

  async updateProfile(userId: number, data: { fullname: string; email?: string | null }) {
    await this.prisma.user.update({ where: { id: userId }, data: { fullname: data.fullname, email: data.email || null } });
  }
}
