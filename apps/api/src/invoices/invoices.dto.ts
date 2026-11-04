import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { INVOICE_STATUSES, REQUEST_STATUSES, type InvoiceStatus, type RequestStatus } from '@sml/shared';
import { ListQueryDto } from '../common/list-query.dto.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');
const MAX_MONEY = 1e15;

export class InvoiceItemDto {
  @IsString() @MaxLength(100, { message: 'Description item maksimal 100 karakter.' }) description: string;
  @IsOptional() @Nullable() @IsInt() keperluanId: number | null;
  @IsInt({ message: 'Pax harus bilangan bulat.' }) @Min(0, { message: 'Pax tidak boleh negatif.' }) @Max(32767) qty: number;
  @IsNumber({}, { message: 'Price Per Pax harus berupa angka.' }) @Min(-MAX_MONEY) @Max(MAX_MONEY) unitPrice: number;
}

export class InvoiceGroupClientDto {
  @IsOptional() @Nullable() @IsInt() clientId: number | null;
  /** Wajib bila clientId kosong; bila terhubung ke client boleh kosong (dipakai nama client). */
  @IsString() @MaxLength(90, { message: 'Nama TKA maksimal 90 karakter.' }) name: string;
}

export class InvoiceGroupDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => InvoiceGroupClientDto) clients: InvoiceGroupClientDto[];
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items: InvoiceItemDto[];
}

export class InvoiceTaxDto {
  @IsOptional() @Nullable() @IsInt() taxId: number | null;
  @IsString() @MaxLength(100) description: string;
  @IsNumber({}, { message: 'Nilai pajak harus berupa angka.' }) @Min(-MAX_MONEY) @Max(MAX_MONEY) value: number;
}

/** Simpan invoice (header + seluruh grup/item/pajak sekaligus). */
export class SaveInvoiceDto {
  @IsOptional() @Nullable() @IsString() @MaxLength(40, { message: 'Invoice No maksimal 40 karakter.' }) no: string | null;
  @IsOptional() @Nullable() @IsInt() companyId: number | null;
  @IsOptional() @Nullable() @IsInt() sponsorId: number | null;
  @IsOptional() @Nullable() @IsInt() billToId: number | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(40) npwp: string | null;
  @IsOptional() @Nullable() @Matches(DATE, { message: 'Invoice Date harus berformat YYYY-MM-DD.' }) date: string | null;
  @IsOptional() @Nullable() @Matches(DATE, { message: 'Paid Date harus berformat YYYY-MM-DD.' }) paidDate: string | null;
  @IsIn(INVOICE_STATUSES) status: InvoiceStatus;
  @IsOptional() @Nullable() @IsString() @MaxLength(4000) information: string | null;
  @IsOptional() @Nullable() @IsInt() bankAccountId: number | null;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceGroupDto) groups: InvoiceGroupDto[];
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => InvoiceTaxDto) taxes: InvoiceTaxDto[];
}

export class CreateInvoiceDto {
  @IsArray() @ArrayMinSize(1, { message: 'Pilih minimal satu client.' }) @ArrayMaxSize(1000) @IsInt({ each: true }) clientIds: number[];
  @IsInt({ message: 'Company wajib dipilih.' }) companyId: number;
  @IsOptional() @Nullable() @IsInt() billToId?: number | null;
}

/** Tabel updaterequest lama tidak punya kolom alasan; alasan hanya dicatat di log server. */
export class RequestEditDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class InvoiceListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: INVOICE_STATUSES }) @IsOptional() @IsIn(INVOICE_STATUSES) status?: InvoiceStatus;
  @ApiPropertyOptional({ description: 'Invoice date dari (YYYY-MM-DD)' }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ description: 'Invoice date sampai (YYYY-MM-DD)' }) @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sponsorId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() billToId?: number;
}

/** Cari client yang belum ber-invoice (Create Invoice & tambah client di form invoice). */
export class InvoiceableQueryDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sponsorId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() projectId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() billToId?: number;
  @ApiPropertyOptional({ description: 'Nama / no paspor' }) @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class PriceListQueryDto {
  @Type(() => Number) @IsInt() billToId: number;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) date?: string;
}

export class RequestListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: REQUEST_STATUSES }) @IsOptional() @IsIn(REQUEST_STATUSES) status?: RequestStatus;
}
