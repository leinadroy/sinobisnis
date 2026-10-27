import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canEdit, canView } from '@sml/shared';
import { IS_PUBLIC, MENU_ACCESS, type MenuAccessMeta } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';

/** Guard global: semua endpoint butuh Bearer token kecuali yang ditandai @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Belum login.');
    req.user = await this.auth.resolveToken(token);
    return true;
  }
}

/** Guard global: cek matriks hak akses role untuk endpoint yang memakai @Menu(key). */
@Injectable()
export class MenuAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<MenuAccessMeta>(MENU_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return true; // endpoint @Public
    const mode = meta.mode ?? (['GET', 'HEAD'].includes(req.method) ? 'view' : 'edit');
    const ok = mode === 'view' ? canView(user.access, meta.key) : canEdit(user.access, meta.key);
    if (!ok) throw new ForbiddenException('Role Anda tidak memiliki akses ke fitur ini.');
    return true;
  }
}
