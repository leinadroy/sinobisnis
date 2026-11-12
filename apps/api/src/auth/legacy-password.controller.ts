import { Body, Controller, ForbiddenException, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { LegacyPasswordTestResult } from '@sml/shared';
import { AllowOnReadOnly, CurrentUser } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth.types.js';
import { legacySystemSalt, passwordFormat, verifyLegacyPassword, verifyPassword } from './password.js';

class LegacyPasswordTestDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100)
  username: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200)
  password: string;
}

/**
 * Developer Menu → Tes Password GX: uji rumus hash GeneXus (SHA-256 password + SystemSalt + UsersSalt) pada user sungguhan.
 * Hanya membaca tabel users (database login aktif); tidak mengubah password, tidak mencatat password, tidak mengembalikan hash/salt.
 * Login aplikasi memakai rumus yang sama (password.ts verifyPassword) bila LEGACY_SYSTEM_SALT diisi.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/legacy-password')
export class LegacyPasswordController {
  constructor(private readonly prisma: PrismaService) {}

  @AllowOnReadOnly()
  @Post('test')
  @HttpCode(200)
  async test(@Body() dto: LegacyPasswordTestDto, @CurrentUser() user: AuthUser): Promise<LegacyPasswordTestResult> {
    if (!user.isSuperRole) throw new ForbiddenException('Hanya role Developer yang bisa menguji password.');
    const started = Date.now();
    const u = await this.prisma.authDb.user.findFirst({
      where: { username: dto.username.trim() },
      select: { id: true, username: true, isActive: true, salt: true, hashedPassword: true },
    });
    if (!u) throw new NotFoundException(`User "${dto.username.trim()}" tidak ada di database login.`);
    const format = passwordFormat(u);
    const systemSalt = legacySystemSalt();
    return {
      userId: u.id,
      username: u.username,
      isActive: u.isActive,
      authDatabase: this.prisma.authSource,
      format,
      saltLength: u.salt.trim().length,
      hashLength: u.hashedPassword.trim().length,
      systemSaltConfigured: Boolean(systemSalt),
      legacyMatch: format === 'legacy' && systemSalt ? verifyLegacyPassword(u, dto.password, systemSalt) : null,
      bcryptMatch: format === 'bcrypt' ? await verifyPassword(u, dto.password) : null,
      ms: Date.now() - started,
    };
  }
}
