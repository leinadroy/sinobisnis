import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { REMINDER_TYPES, type ReminderType } from '@sml/shared';
import { ListQueryDto } from '../common/list-query.dto.js';

export class RunReminderDto {
  /** Kirim ulang walaupun kategori itu sudah terkirim hari ini. */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class TestEmailDto {
  @IsEmail({}, { message: 'Format email tidak valid.' }) to: string;
}

export class ReminderItemsQueryDto {
  @IsIn(REMINDER_TYPES) type: ReminderType;
}

export class ReminderLogQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['SENT', 'NOT SENT', 'FAILED'] }) @IsOptional() @IsIn(['SENT', 'NOT SENT', 'FAILED']) status?: string;
  @ApiPropertyOptional({ enum: REMINDER_TYPES }) @IsOptional() @IsIn(REMINDER_TYPES) type?: string;
  /** Tampilkan juga log "(0 items)". */
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === '1' || value === 'true') @IsBoolean() withEmpty?: boolean;
}

/** Key seperti tabel lama: huruf/angka/spasi/garis bawah, mis. "SMTP Host". */
const KEY = /^[A-Za-z][A-Za-z0-9 _.-]{1,99}$/;

export class SystemConfigValueDto {
  /** null = kosongkan. */
  @IsOptional() @IsString() @MaxLength(1000) value: string | null;
}

export class CreateSystemConfigDto extends SystemConfigValueDto {
  @IsString() @IsNotEmpty() @Matches(KEY, { message: 'Key 2–100 karakter: huruf, angka, spasi, titik, minus, garis bawah; diawali huruf.' }) key: string;
}
