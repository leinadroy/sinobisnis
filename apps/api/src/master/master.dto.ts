import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PERIODE_UNITS, PRINT_FORMATS, SUMBER_DATA, TAX_TYPES } from '@sml/shared';

// Panjang maksimal mengikuti kolom tabel production.
const req = (label: string) => ({ message: `${label} wajib diisi.` });
/** Opsional & boleh null (kosongkan field). */
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Text = (max: number) => (target: object, key: string) => {
  IsOptional()(target, key);
  Nullable()(target, key);
  IsString()(target, key);
  MaxLength(max, { message: `${key} maksimal ${max} karakter.` })(target, key);
};

export class SponsorDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(100) name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SponsorProjectDto {
  @IsInt({ message: 'Sponsor wajib dipilih.' }) sponsorId: number;
  @IsString() @IsNotEmpty(req('Project Name')) @MaxLength(100) name: string;
  @Text(100) kodePerusahaan?: string | null;
  @Text(100) companyName?: string | null;
  @Text(100) npwp?: string | null;
  @Text(100) alamat1?: string | null;
  @Text(100) alamat2?: string | null;
  @Text(100) alamat3?: string | null;
  @Text(100) alamat4?: string | null;
}

export class BillToDto {
  @Text(40) kodePerusahaan?: string | null;
  @IsString() @IsNotEmpty(req('Company Name')) @MaxLength(200) companyName: string;
  @Text(100) npwp?: string | null;
  @Text(100) alamat1?: string | null;
  @Text(100) alamat2?: string | null;
  @Text(100) alamat3?: string | null;
  @Text(100) alamat4?: string | null;
}

export class KeperluanDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(40) name: string;
  @IsOptional() @Nullable() @IsInt() @Min(0) @Max(32767) periode?: number | null;
  @IsOptional() @Nullable() @IsIn([...PERIODE_UNITS]) periodeIn?: string | null;
  @IsOptional() @Nullable() @IsIn([...SUMBER_DATA]) sumberData?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Nullable() @IsInt() @Min(0) @Max(32767) reminderExpiredDokumen?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) @Max(32767) reminderExpired2nd?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) @Max(32767) reminderPembuatanInvoice?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) @Max(32767) reminderPembayaranInvoice?: number | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) @Max(32767) reminderEpo?: number | null;
}

export class CompanyDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(40) name: string;
  @Text(4000) address?: string | null;
  @IsString() @IsNotEmpty(req('Invoice No Format')) @MaxLength(40) invoiceNoFormat: string;
  @IsOptional() @Nullable() @IsIn([...PRINT_FORMATS]) printFormat?: string | null;
  @IsOptional() @Nullable() @IsInt() @Min(0) invoiceLastNo?: number | null;
  @IsOptional() @Nullable() @IsInt() bankAccountId?: number | null;
  @Text(4000) invoiceInformation?: string | null;
  @Text(40) invoiceSignedBy?: string | null;
}

export class BankAccountDto {
  @IsString() @IsNotEmpty(req('Bank Name')) @MaxLength(400) bankName: string;
  @Text(400) branch?: string | null;
  @Text(100) address1?: string | null;
  @Text(100) address2?: string | null;
  @Text(100) address3?: string | null;
  @Text(100) address4?: string | null;
  @Text(100) swiftcode?: string | null;
  @IsString() @IsNotEmpty(req('Account For')) @MaxLength(100) accountFor: string;
  @IsString() @IsNotEmpty(req('Account No')) @MaxLength(40) accountNo: string;
}

export class TaxDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(40) name: string;
  @IsInt({ message: 'Percentage harus bilangan bulat.' }) @Min(0) @Max(100) percentage: number;
  @IsOptional() @IsIn([...TAX_TYPES]) additionReduction?: string;
}

export class EmailTemplateDto {
  @IsString() @IsNotEmpty(req('Template Description')) @MaxLength(400) description: string;
  @IsString() @IsNotEmpty(req('Template Subject')) @MaxLength(40, { message: 'Template Subject maksimal 40 karakter.' }) subject: string;
  @IsString() @MaxLength(4000) @Matches(/@@ClientData@@/, { message: 'Content wajib memuat @@ClientData@@.' }) content: string;
}

export class EmailRecipientDto {
  @IsString() @IsNotEmpty(req('Name')) @MaxLength(40) name: string;
  @IsEmail({}, { message: 'Format email tidak valid.' }) @MaxLength(100) address: string;
  @IsOptional() @IsBoolean() isAccounting?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
