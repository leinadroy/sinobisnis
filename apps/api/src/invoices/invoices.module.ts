import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module.js';
import { KontrakModule } from '../kontrak/kontrak.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [ClientsModule, KontrakModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
