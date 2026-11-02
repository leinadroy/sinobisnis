import { ApiPropertyOptional } from '@nestjs/swagger';
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
}

const KEY = /^[A-Z][A-Z0-9_]{1,63}$/;

export class SystemConfigValueDto {
  /** null = kosongkan. */
  @IsOptional() @IsString() @MaxLength(20000) value: string | null;
}

export class CreateSystemConfigDto extends SystemConfigValueDto {
  @IsString() @IsNotEmpty() @Matches(KEY, { message: 'Key 2–64 karakter: huruf besar, angka, garis bawah; diawali huruf.' }) key: string;
}
