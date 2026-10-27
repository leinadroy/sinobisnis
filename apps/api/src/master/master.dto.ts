import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PERIODE_UNITS, SUMBER_DATA, TAX_TYPES } from '@sml/shared';

const req = (label: string) => ({ message: `${label} wajib diisi.` });
/** Opsional & boleh null (kosongkan field). */
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class SponsorDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(200) name: string;
}

export class SponsorProjectDto {
  @IsInt({ message: 'Sponsor wajib dipilih.' }) sponsorId: number;
  @IsString() @IsNotEmpty(req('Project Name')) @MaxLength(200) name: string;
  @IsOptional() @Nullable() @IsInt() billToId?: number | null;
}

export class BillToDto {
  @IsOptional() @Nullable() @IsString() @MaxLength(50) kodePerusahaan?: string | null;
  @IsString() @IsNotEmpty(req('Company Name')) @MaxLength(300) companyName: string;
  @IsOptional() @Nullable() @IsString() @MaxLength(50) npwp?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(300) alamat1?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(300) alamat2?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(300) alamat3?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(300) alamat4?: string | null;
}

export class KeperluanDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(200) name: string;
  @IsOptional() @IsInt() @Min(0) periode?: number;
  @IsOptional() @IsIn([...PERIODE_UNITS]) periodeIn?: 'MONTHS' | 'DAYS';
  @IsOptional() @IsIn([...SUMBER_DATA]) sumberData?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() @Min(0) harga?: number;
  @IsOptional() @Nullable() @IsInt() @Min(0) reminderExpiredDokumen?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) reminderExpired2nd?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) reminderPembuatanInvoice?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) reminderPembayaranInvoice?: number | null;
}

export class CompanyDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(200) name: string;
  @IsOptional() @Nullable() @IsString() address?: string | null;
  @IsOptional() @IsInt() @Min(0) lastNo?: number;
  @IsOptional() @IsString() @MaxLength(100) noFormat?: string;
  @IsOptional() @Nullable() @IsInt() bankAccountId?: number | null;
  @IsOptional() @Nullable() @IsString() invoiceInformation?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(100) signedBy?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(100) signedTitle?: string | null;
}

export class BankAccountDto {
  @IsString() @IsNotEmpty(req('Bank Name')) @MaxLength(200) bankName: string;
  @IsOptional() @Nullable() @IsString() @MaxLength(200) branch?: string | null;
  @IsOptional() @Nullable() @IsString() address?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(30) swiftcode?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(200) accountFor?: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(60) accountNo?: string | null;
}

export class TaxDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(100) name: string;
  @IsNumber({}, { message: 'Percentage harus angka.' }) @Min(0) @Max(100) percentage: number;
  @IsOptional() @IsIn([...TAX_TYPES]) type?: 'ADDITION' | 'REDUCTION';
}
