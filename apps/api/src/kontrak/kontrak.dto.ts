import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined && v !== '');

/** Satu baris kontrakdetail: harga untuk satu Keperluan. */
export class KontrakItemDto {
  @IsInt({ message: 'Keperluan wajib dipilih.' }) keperluanId: number;
  @IsOptional() @Nullable() @IsString() @MaxLength(100) duration: string | null;
  @IsNumber({}, { message: 'Price harus berupa angka.' }) @Min(0, { message: 'Price tidak boleh negatif.' }) @Max(1e15) price: number;
}

/** Simpan kontrak (header + seluruh item harga sekaligus). */
export class KontrakDto {
  @IsOptional() @Nullable() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tanggal kontrak harus berformat YYYY-MM-DD.' }) date: string | null;
  @IsInt({ message: 'Bill To wajib dipilih.' }) billToId: number;
  @IsOptional() @Nullable() @IsString() @MaxLength(40) nomor: string | null;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => KontrakItemDto) items: KontrakItemDto[];
}
