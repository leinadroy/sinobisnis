import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { SerializeInterceptor } from './common/serialize.interceptor.js';
import { MasterModule } from './master/master.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RolesModule } from './roles/roles.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, RolesModule, MasterModule, ClientsModule],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: SerializeInterceptor }],
})
export class AppModule {}
