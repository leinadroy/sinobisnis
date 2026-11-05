import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { KontrakModule } from './kontrak/kontrak.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { MasterModule } from './master/master.module.js';
import { SerializeInterceptor } from './common/serialize.interceptor.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RolesModule } from './roles/roles.module.js';
import { UsersModule } from './users/users.module.js';
import { DatabaseController } from './database/database.controller.js';

@Module({
  // Tahap penulisan ulang ke struktur production: modul lain diaktifkan kembali setelah ditulis ulang
  // (lihat "exclude" di tsconfig.build.json).
  imports: [PrismaModule, AuthModule, UsersModule, RolesModule, MasterModule, ClientsModule, KontrakModule, InvoicesModule, RemindersModule],
  controllers: [AppController, DatabaseController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: SerializeInterceptor }],
})
export class AppModule {}
