import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { DbActive, DbProfilesResponse, DbTestResult } from '@sml/shared';
import { AllowOnReadOnly, CurrentUser } from '../common/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { describeUrl, loadProfiles, readState, stateFile, toActive } from './db-profiles.js';

class SwitchDbDto {
  @IsString() @MaxLength(40) key: string;
  /** Untuk profil production: ketik nama profil (huruf besar) sebagai konfirmasi. */
  @IsOptional() @IsString() @MaxLength(40) confirm?: string;
}

const developerOnly = (user: AuthUser) => {
  if (!user.isSuperRole) throw new ForbiddenException('Hanya role Developer yang bisa mengatur database.');
};

/** Developer Menu → Database: lihat, tes, dan pilih profil koneksi database (isi koneksi ada di .env server). */
@ApiTags('database')
@ApiBearerAuth()
@Controller('database')
export class DatabaseController {
  constructor(private readonly prisma: PrismaService) {}

  /** Database aktif (label di header) — semua user yang login. */
  @Get('active')
  active(): DbActive {
    return toActive(this.prisma.activeProfile);
  }

  @Get('profiles')
  profiles(@CurrentUser() user: AuthUser): DbProfilesResponse {
    developerOnly(user);
    const active = this.prisma.activeProfile.key;
    const state = readState();
    const all = loadProfiles();
    return {
      profiles: all.map((p) => {
        const d = describeUrl(p.url);
        const auth = p.authKey ? all.find((a) => a.key === p.authKey) : undefined;
        return {
          ...toActive(p), port: d.port, user: d.user, configured: Boolean(p.url), active: p.key === active, danger: p.danger, menuSync: p.menuSync,
          authKey: p.authKey, authLabel: auth?.label ?? null,
        };
      }),
      lastChange: state ? { at: state.at, by: state.by, from: state.from, to: state.active } : null,
      stateFile: stateFile(),
    };
  }

  @AllowOnReadOnly()
  @Post('profiles/:key/test')
  @HttpCode(200)
  test(@Param('key') key: string, @CurrentUser() user: AuthUser): Promise<DbTestResult> {
    developerOnly(user);
    return this.prisma.test(this.find(key));
  }

  /** Pindah database. Setelah berhasil semua user (termasuk yang memindah) harus login ulang. */
  @AllowOnReadOnly()
  @Post('switch')
  @HttpCode(200)
  async switch(@Body() dto: SwitchDbDto, @CurrentUser() user: AuthUser): Promise<DbTestResult> {
    developerOnly(user);
    const target = this.find(dto.key);
    if (target.key === this.prisma.activeProfile.key) throw new BadRequestException('Profil ini sudah aktif.');
    if (!target.url) throw new BadRequestException('URL profil ini belum diisi di .env server.');
    if (target.danger && dto.confirm?.trim() !== target.key.toUpperCase()) {
      throw new BadRequestException(`Ketik ${target.key.toUpperCase()} untuk konfirmasi pindah ke database ${target.label}.`);
    }
    const from = this.prisma.activeProfile;
    const res = await this.prisma.switchTo(target, `${user.username} (#${user.id})`);
    if (!res.ok) throw new BadRequestException(`Tidak jadi pindah — ${res.error ?? 'koneksi gagal'}`);
    // Catatan di database tujuan (datalog tidak punya foreign key ke users); database hanya-baca tidak ditulis —
    // perpindahannya tetap tercatat di config/db-switch.log.
    if (!target.readOnly) await this.prisma.dataLog.create({
      data: {
        tableName: 'Database', tableId: 0, userId: user.id, created: new Date(), tableAction: 'Update',
        description: `Database aplikasi dipindah dari ${from.key} (${from.label}) ke ${target.key} (${target.label}) oleh ${user.username}`,
      },
    }).catch(() => undefined);
    return res;
  }

  private find(key: string) {
    const p = loadProfiles().find((x) => x.key === key.trim().toLowerCase());
    if (!p) throw new NotFoundException('Profil database tidak ditemukan.');
    return p;
  }
}
