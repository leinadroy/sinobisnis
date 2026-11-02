import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');

export class KontrakItemDto {
  @IsOptional() @Nullable() @IsInt() keperluanId: number | null;
  /** Kosong = pakai nama Keperluan. */
  @IsOptional() @IsString() @MaxLength(500) description: string;
  @IsOptional() @Nullable() @IsString() @MaxLength(100) duration: string | null;
  @IsNumber({}, { message: 'Price harus berupa angka.' }) @Min(0, { message: 'Price tidak boleh negatif.' }) @Max(1e15) price: number;
}

/** Simpan kontrak (header + seluruh item harga sekaligus). */
export class KontrakDto {
  @IsOptional() @Nullable() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tanggal kontrak harus berformat YYYY-MM-DD.' }) date: string | null;
  @IsInt({ message: 'Bill To wajib dipilih.' }) billToId: number;
  /** Kosong = alamat Bill To. */
  @IsOptional() @Nullable() @IsString() @MaxLength(1000) alamat: string | null;
  @IsOptional() @Nullable() @IsString() @MaxLength(20000) isi: string | null;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => KontrakItemDto) items: KontrakItemDto[];
}
