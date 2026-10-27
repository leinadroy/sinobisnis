import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard, MenuAccessGuard } from './guards.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET belum diisi di apps/api/.env');
        return { secret: process.env.JWT_SECRET, signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as never } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Urutan penting: JWT dulu (mengisi req.user), lalu hak akses menu.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MenuAccessGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
