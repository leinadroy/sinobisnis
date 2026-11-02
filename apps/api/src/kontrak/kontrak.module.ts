import { Module } from '@nestjs/common';
import { KontrakController } from './kontrak.controller.js';
import { KontrakService } from './kontrak.service.js';

@Module({
  controllers: [KontrakController],
  providers: [KontrakService],
  exports: [KontrakService],
})
export class KontrakModule {}
