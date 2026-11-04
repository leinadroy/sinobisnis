import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../common/list-query.dto.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');
const DateField = () => (target: object, key: string) => {
  IsOptional()(target, key);
  Nullable()(target, key);
  Matches(DATE, { message: `${key} harus berformat YYYY-MM-DD.` })(target, key);
};
const Text = (max = 500) => (target: object, key: string) => {
  IsOptional()(target, key);
  Nullable()(target, key);
  IsString()(target, key);
  MaxLength(max, { message: `${key} maksimal ${max} karakter.` })(target, key);
};
const RefId = () => (target: object, key: string) => {
  IsOptional()(target, key);
  Nullable()(target, key);
  IsInt()(target, key);
};

/** Body update client (semua field opsional; kirim null / '' untuk mengosongkan). */
export class ClientDto {
  @DateField() tanggalPermohonan?: string | null;
  @RefId() sponsorId?: number | null;
  @RefId() projectId?: number | null;
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Nama Client wajib diisi.' }) @MaxLength(40, { message: 'Nama Client maksimal 40 karakter.' }) name?: string;
  @Text(40) noPaspor?: string | null;
  @DateField() tanggalLahir?: string | null;
  @RefId() keperluanId?: number | null;
  @Text(40) noRptka?: string | null;
  @DateField() pembayaranPnbp?: string | null;
  @Text(40) permohonanHariKe3?: string | null;
  @DateField() tanggalProsesSelesai?: string | null;
  @DateField() tanggalTerbitDokumen?: string | null;
  @DateField() tanggalMasukLastExp?: string | null;
  @DateField() expiredDokumen?: string | null;
  @Text(40) epo?: string | null;
  @Text(40) noInvoice?: string | null;
  @DateField() tanggalInvoice?: string | null;
  @DateField() tanggalPembayaranInvoice?: string | null;
  @Text(40) prosesPerpanjangan?: string | null;
  @Text(40) sktt?: string | null;
  @Text(40) stm?: string | null;
  @Text(40) status?: string | null;
  @Text(4000) keteranganTka?: string | null;
  @IsOptional() @IsBoolean() isArchived?: boolean;
  @Text(100) archivedReason?: string | null;
}

/** Saat membuat client, nama wajib. */
export class CreateClientDto extends ClientDto {
  @IsString() @IsNotEmpty({ message: 'Nama Client wajib diisi.' }) @MaxLength(40, { message: 'Nama Client maksimal 40 karakter.' }) declare name: string;
}

export class ArchiveDto {
  @IsBoolean() archive: boolean;
  @IsOptional() @IsString() @MaxLength(100) reason?: string;
}

export class ConversationDto {
  @IsString() @IsNotEmpty({ message: 'Pesan tidak boleh kosong.' }) @MaxLength(1000) message: string;
}

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class ClientListQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sponsorId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() keperluanId?: number;
  @ApiPropertyOptional({ description: 'Tanggal permohonan dari (YYYY-MM-DD)' }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ description: 'Tanggal permohonan sampai (YYYY-MM-DD)' }) @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional({ description: 'Expired dalam N hari (termasuk yang sudah lewat)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) expiring?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() uninvoiced?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() unpaid?: boolean;
}
