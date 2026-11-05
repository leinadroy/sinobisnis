import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { LoginResponse, MeResponse } from '@sml/shared';
import { AllowOnReadOnly, CurrentUser, Public } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toActive } from '../database/db-profiles.js';
import { ChangePasswordDto, LoginDto, UpdateProfileDto } from './auth.dto.js';
import type { AuthUser } from './auth.types.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Public()
  @AllowOnReadOnly() // login & password ditulis ke database login (profil tulis), bukan database hanya-baca
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto.username, dto.password);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): MeResponse {
    const { access, isSuperRole, ...sessionUser } = user;
    return { user: sessionUser, access, isSuperRole, database: toActive(this.prisma.activeProfile) };
  }

  @ApiBearerAuth()
  @AllowOnReadOnly()
  @Post('change-password')
  @HttpCode(204)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.current, dto.password);
  }

  @ApiBearerAuth()
  @AllowOnReadOnly()
  @Patch('profile')
  @HttpCode(204)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }
}
